(() => {
  const WPM = 300; // target speed — change this
  const el = document.querySelector('.letters');
  if (!el) return alert('Open humanbenchmark.com/tests/typing first');
  const text = [...el.querySelectorAll('span')].map(s => s.textContent).join('').replace(/ /g, ' ');
  const ms = 60000 / (WPM * 5);
  let i = 0;
  const tick = () => {
    if (i >= text.length) return;
    const key = text[i++];
    for (const type of ['keydown', 'keypress', 'keyup'])
      el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
    setTimeout(tick, ms);
  };
  tick();
})();
