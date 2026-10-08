# AIBots
Making bots to cheese games

All of these are for single-player games and practice tests. Don't use them in live races or matches against real people.

## Setup
```bash
npm ci                        # Playwright, for the .mjs bots
npx playwright install chromium
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # for the autoclicker
```

## Bots

### Universal typing bot — `typer.mjs`
Works on most typing sites (tested on Monkeytype, 10fastfingers, Human Benchmark, keybr).
```bash
node typer.mjs [url] [--wpm N]
```
Opens a browser. Go to any typing test and press **Ctrl+Shift+Y** to start typing (press again to stop).
If it picks the wrong text, highlight the text first and then press the hotkey.
It finds the text by scoring parts of the page that look like typing text (lots of short letter/word pieces, large font, next to an input) and keeps re-reading the page for tests that add words as you go. Some sites (keybr) ignore super-fast typing — use `--wpm 300`.

### Human Benchmark typing — `typing-bot.mjs` / `console-snippet.js`
- `node typing-bot.mjs [delayMs]` — opens the test and types it (~6500 WPM at max speed).
- `console-snippet.js` — paste into the browser console on the typing test. Change `WPM` at the top.

### Human Benchmark aim trainer — `aim-snippet-fast.js` / `aim-snippet.js`
Paste into the console on https://humanbenchmark.com/tests/aim.
`aim-snippet-fast.js` reacts to page changes instantly (0 ms per target). Set `DELAY_MS` for a human-looking score.

### 2048 — `2048-bot.js`
Paste into the console on https://play2048.co. Stop with `__bot2048.stop()`.
Reads the board from the game's own state messages and picks moves with expectimax search (the approach from nneonneo's 2048 AI). In simulation it reached the 16384 tile in both test games.

### Autoclicker — `autoclicker.py`
```bash
.venv/bin/python autoclicker.py [--cps 20] [--right]
```
Toggle with **Ctrl+Option+C** (Ctrl+Alt+C on Windows/Linux) or **F6**. Move the mouse to the top-left corner to stop it instantly. Ctrl+C quits.
On macOS, allow your terminal app in System Settings → Privacy & Security → Accessibility (and Input Monitoring if the hotkey doesn't work).
