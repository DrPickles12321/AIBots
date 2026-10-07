(() => {
  const DELAY_MS = 0; // pause before each click; 0 = instant, ~150 looks human
  const fire = (el) => {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, opts));
  };
  let last = null, busy = false;
  const id = setInterval(() => {
    const t = document.querySelector('[data-aim-target="true"]');
    if (!t) { if (last) clearInterval(id); return; }   // game over
    if (busy) return;
    const key = t.getAttribute('style') + t.parentElement?.getAttribute('style');
    if (t === last && key === last.key) return;          // same target, already hit
    busy = true;
    setTimeout(() => { fire(t); last = t; last.key = key; busy = false; }, DELAY_MS);
  }, 5);
})();
