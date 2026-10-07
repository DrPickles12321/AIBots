(() => {
  const DELAY_MS = 0; // 0 = click the instant the target appears; e.g. 300 looks human
  const fire = (el) => {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
  };
  let lastKey = null;
  const check = () => {
    const t = document.querySelector('[data-aim-target="true"]');
    if (!t) { if (lastKey) obs.disconnect(); return; }      // game over
    const key = t.parentElement?.getAttribute('style');     // position changes per target
    if (key === lastKey) return;                             // already hit this one
    lastKey = key;
    DELAY_MS ? setTimeout(() => fire(t), DELAY_MS) : fire(t);
  };
  // React to DOM changes immediately instead of polling on a timer.
  const obs = new MutationObserver(check);
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  check();
})();
