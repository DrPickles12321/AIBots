"""Toggleable autoclicker (macOS / Windows / Linux).

    .venv/bin/python autoclicker.py [--cps 20] [--right]

Toggle on/off: Ctrl+Alt+C (Ctrl+Option+C on Mac) or F6.
Emergency stop: move the mouse to the top-left corner of the screen.
Quit: Ctrl+C in the terminal.
On macOS, your terminal app needs Accessibility permission
(System Settings > Privacy & Security > Accessibility).
"""
import argparse
import threading
import time

from pynput import keyboard, mouse

parser = argparse.ArgumentParser(description="Toggleable autoclicker")
parser.add_argument("--cps", type=float, default=20, help="clicks per second (default 20)")
parser.add_argument("--right", action="store_true", help="right-click instead of left-click")
args = parser.parse_args()
cps = min(max(args.cps, 1), 1000)

button = mouse.Button.right if args.right else mouse.Button.left
clicker = mouse.Controller()
on = threading.Event()


def toggle():
    if on.is_set():
        on.clear()
        print("OFF", flush=True)
    else:
        print(f"ON  - clicking {cps:g}/sec", flush=True)
        # Let go of the hotkey first, or the first click becomes Ctrl+click (a right-click on Mac).
        time.sleep(0.3)
        on.set()


def click_loop():
    interval = 1 / cps
    next_t = time.perf_counter()
    while True:
        on.wait()
        x, y = clicker.position
        if x < 3 and y < 3:
            on.clear()
            print("OFF (mouse in top-left corner)", flush=True)
            continue
        clicker.click(button)
        # Schedule against a fixed clock so the rate stays steady.
        next_t = max(next_t + interval, time.perf_counter())
        time.sleep(max(0, next_t - time.perf_counter()))


threading.Thread(target=click_loop, daemon=True).start()

print(f"Autoclicker ready ({'right' if args.right else 'left'} click, {cps:g}/sec).")
print("Toggle: Ctrl+Alt+C (Ctrl+Option+C on Mac) or F6.  Emergency stop: mouse to top-left corner.  Quit: Ctrl+C.")
hotkeys = keyboard.GlobalHotKeys({"<ctrl>+<alt>+c": toggle, "<f6>": toggle})
hotkeys.start()
try:
    while hotkeys.is_alive():
        hotkeys.join(0.5)
except KeyboardInterrupt:
    print("\nBye.")
