// Human Benchmark typing test bot.
// Usage: node typing-bot.mjs [delayMsPerKey]   (default 0 = as fast as possible)
import { chromium } from 'playwright';

const URL = 'https://humanbenchmark.com/tests/typing';
const delay = Number(process.argv[2] ?? 0);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Dismiss cookie/consent popup if one appears (reject non-essential when possible).
for (const label of [/reject all/i, /do not consent/i, /necessary only/i, /close/i]) {
  const btn = page.getByRole('button', { name: label }).first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click().catch(() => {});
    break;
  }
}

const letters = page.locator('.letters');
await letters.waitFor({ state: 'visible', timeout: 30000 });

// Each character is its own <span>; join them so nothing gets collapsed.
const text = await letters.evaluate((el) => {
  const spans = el.querySelectorAll('span');
  const raw = spans.length ? Array.from(spans, (s) => s.textContent).join('') : el.textContent;
  return raw.replace(/ /g, ' ');
});
console.log(`Typing ${text.length} chars:\n${text}\n`);

await letters.click();
// Real (trusted) key events via CDP, so the site registers every keystroke.
await page.keyboard.type(text, { delay });

// Print the result once it shows up.
const result = page.locator('h1').filter({ hasText: /wpm/i }).first();
if (await result.isVisible({ timeout: 10000 }).catch(() => false)) {
  console.log('Result:', (await result.textContent()).trim());
} else {
  console.log('Done typing — check the browser for your score.');
}
console.log('Browser left open. Press Ctrl+C to quit.');
await new Promise(() => {});
