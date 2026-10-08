// Universal typing-test bot.
//   node typer.mjs [url] [--wpm N]
// Opens a browser. Go to any typing test, then press Ctrl+Shift+Y to make it type.
// Press Ctrl+Shift+Y again while it's typing to stop. Highlight text first to type exactly that.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

// Runs inside the page: find the text the user is supposed to type.
export function detectText() {
  const sel = String(getSelection()).replace(/\s+/g, ' ').trim();
  if (sel.length > 2) return { text: sel, score: Infinity, how: 'selection' };

  const SKIP = 'svg,a,nav,header,footer,button,select,script,style,noscript,[role=navigation],[role=menu]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const isToken = (k) => {
    if (k.matches(SKIP)) return false;
    const t = k.textContent;
    return t.length <= 30 && !t.includes('\n');
  };

  let best = null;
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length < 4 || el.closest(SKIP) || !visible(el)) continue;
    const kids = [...el.children];
    const tokens = kids.filter(isToken);
    if (tokens.length < 4 || tokens.length < kids.length * 0.6) continue;
    const chars = tokens.reduce((n, k) => n + k.textContent.length, 0);
    if (chars < 10) continue;
    const near = el.closest('[tabindex]') || el.parentElement?.parentElement?.querySelector('input:not([type=hidden]),textarea');
    const named = /word|text|typ|letter|quote|prompt|passage|lesson/i.test(el.id + ' ' + el.className + ' ' + (el.dataset.testid || ''));
    const noTranslate = el.closest('[translate=no],.notranslate');
    // Typing text is big and on screen; leaderboards and footers are small or far down.
    let leaf = tokens[0]; while (leaf.firstElementChild) leaf = leaf.firstElementChild;
    const size = parseFloat(getComputedStyle(leaf).fontSize) || 16;
    const onScreen = el.getBoundingClientRect().top < innerHeight;
    const score = chars * (size / 16) ** 2 * (near ? 2 : 1) * (named ? 1.5 : 1) * (noTranslate ? 1.5 : 1) * (onScreen ? 1 : 0.2);
    if (!best || score > best.score) best = { el, tokens, score };
  }
  if (!best) return null;

  let text = best.el.textContent.replace(/ /g, ' ');
  // Word-per-element layouts (Monkeytype, keybr) have no spaces in the DOM — add them.
  const avg = best.tokens.reduce((n, k) => n + k.textContent.length, 0) / best.tokens.length;
  if (!/\s/.test(text.trim()) && avg > 1.5) text = best.tokens.map((k) => k.textContent).join(' ');
  text = text.replace(/\s+/g, ' ').trim();

  window.__typeBotTarget = best.el;
  return { text, score: best.score, how: `<${best.el.tagName.toLowerCase()} class="${String(best.el.className).slice(0, 40)}">` };
}

// Runs inside the page: make sure keystrokes will land in the typing area.
function focusTarget() {
  const a = document.activeElement;
  const el = window.__typeBotTarget;
  // Only trust the current focus if it's right next to the text (not e.g. a search box).
  const related = a && el && (a.contains(el) || el.contains(a) || a.parentElement?.parentElement?.parentElement?.contains(el));
  if (a && a !== document.body && related) return 'already focused';
  const scope = el?.parentElement?.parentElement?.parentElement || document;
  const input = [...scope.querySelectorAll('input[type=text],input:not([type]),textarea')].find((i) => i.getBoundingClientRect().width > 20);
  if (input) { input.focus(); return 'focused input'; }
  return 'click';
}

function toast(msg) {
  let d = document.getElementById('__typebot_toast');
  if (!d) {
    d = document.createElement('div');
    d.id = '__typebot_toast';
    d.style.cssText = 'position:fixed;z-index:2147483647;bottom:16px;right:16px;padding:8px 12px;border-radius:8px;background:#111;color:#fff;font:13px system-ui;pointer-events:none;opacity:.9';
    document.documentElement.appendChild(d);
  }
  d.textContent = 'TypeBot: ' + msg;
  clearTimeout(d.__t);
  d.__t = setTimeout(() => d.remove(), 2500);
}

// Find the best text across the page and its iframes.
async function detectAll(page) {
  let best = null;
  for (const frame of page.frames()) {
    // Ad iframes can hang forever — give each frame a short deadline.
    const r = await Promise.race([frame.evaluate(detectText).catch(() => null), new Promise((res) => setTimeout(res, 1500, null))]);
    if (r && (!best || r.score > best.score)) best = { ...r, frame };
  }
  return best;
}

export async function typeOnPage(page, { wpm = 0, log = console.log, shouldStop = () => false } = {}) {
  const delay = wpm > 0 ? 12000 / wpm : 0; // 1 word = 5 keystrokes
  const first = await detectAll(page);
  if (!first) { await page.evaluate(toast, 'no text found — highlight it and try again').catch(() => {}); return log('No typing text found.'); }
  log(`Found ${first.text.length} chars via ${first.how}`);
  await page.evaluate(toast, `typing ${first.text.length} chars`).catch(() => {});

  const f = await first.frame.evaluate(focusTarget);
  if (f === 'click') {
    // A real mouse click (also hits "click here to focus" overlays sitting on top of the text).
    const handle = await first.frame.evaluateHandle(() => window.__typeBotTarget);
    await handle.asElement()?.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(100);
  }

  let typed = '';
  let pending = first.text;
  for (let round = 0; pending && round < 500; round++) {
    for (let i = 0; i < pending.length; i += 20) {
      if (shouldStop()) return log('Stopped.');
      const chunk = pending.slice(i, i + 20);
      await page.keyboard.type(chunk, { delay });
      typed += chunk;
    }
    if (first.how === 'selection') break;
    // Endless tests add more words as you go: re-read and continue after what we typed.
    // Find where we are in the new text: look for the end of what we typed. Sites that drop
    // finished lines may have removed part of it, so fall back to shorter pieces (last 2 words, last word).
    const words = typed.trimEnd().split(' ');
    const tails = [typed.trimEnd().slice(-15), words.slice(-2).join(' '), words.slice(-1)[0]];
    let again = null;
    pending = '';
    for (let tries = 0; tries < 6 && !pending; tries++) {
      await page.waitForTimeout(tries ? 150 : 30);
      again = await detectAll(page);
      for (const tail of again ? tails : []) {
        const at = again.text.indexOf(tail);
        if (tail && at >= 0) { pending = again.text.slice(at + tail.length); break; }
      }
    }
    // If the page still shows the very text we just typed (e.g. a results screen re-using it), stop.
    if (pending && again.text === first.text && round > 0) break;
  }
  log(`Done — typed ${typed.length} chars.`);
  await page.evaluate(toast, `done (${typed.length} chars)`).catch(() => {});
}

// ---- CLI ----
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const wpmIdx = args.indexOf('--wpm');
  const wpm = wpmIdx >= 0 ? Number(args[wpmIdx + 1]) : 0;
  const url = args.find((a, i) => !a.startsWith('--') && i !== wpmIdx + 1) || 'https://monkeytype.com';

  const profile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.typer-profile');
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null });
  let busy = false, stop = false;

  await context.exposeBinding('__typeBotTrigger', async ({ page }) => {
    if (busy) { stop = true; return; }
    busy = true; stop = false;
    try { await typeOnPage(page, { wpm, shouldStop: () => stop }); }
    catch (e) { console.log('Error:', e.message); }
    finally { busy = false; }
  });
  await context.addInitScript(() => {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyY') {
        e.preventDefault(); e.stopImmediatePropagation();
        window.__typeBotTrigger();
      }
    }, true);
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(url);
  console.log(`TypeBot ready${wpm ? ` at ~${wpm} WPM` : ' (max speed)'}.`);
  console.log('Go to any typing test and press Ctrl+Shift+Y. Press it again to stop. Close the browser to quit.');
  context.on('close', () => process.exit(0));
}
