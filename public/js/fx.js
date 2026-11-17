// Tap effects: coin burst, shockwave, floating amount and a combo counter. Uses the Web Animations API and caps live particles so phones stay smooth.
let live = 0; const MAX = 70;
let combo = 0, comboAt = 0;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function spawn(box, cls, x, y, html, keyframes, opts) {
  if (live >= MAX) return;
  const el = document.createElement('div'); el.className = 'pfx ' + cls; if (html) el.innerHTML = html;
  el.style.left = x + 'px'; el.style.top = y + 'px'; box.appendChild(el); live++;
  const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...opts });
  a.onfinish = a.oncancel = () => { el.remove(); live--; };
}

export function tapBurst(box, x, y, label, comboEl) {
  const now = performance.now();
  combo = now - comboAt < 650 ? combo + 1 : 1; comboAt = now;
  if (comboEl) {
    comboEl.textContent = combo >= 5 ? `x${combo}` : '';
    comboEl.classList.toggle('on', combo >= 5);
    box.classList.toggle('hot', combo >= 12);
    clearTimeout(comboEl._t); comboEl._t = setTimeout(() => { comboEl.classList.remove('on'); box.classList.remove('hot'); combo = 0; }, 900);
  }
  box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
  if (reduced()) { spawn(box, 'num', x, y - 14, label, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 }); return; }
  const power = Math.min(1.8, 1 + combo / 25);
  spawn(box, 'glowdot', x, y, '', [{ transform: 'scale(.3)', opacity: .9 }, { transform: `scale(${1.6 * power})`, opacity: 0 }], { duration: 420 });
  spawn(box, 'shock', x, y, '', [{ transform: 'scale(.4)', opacity: 1 }, { transform: `scale(${5 * power})`, opacity: 0 }], { duration: 520 });
  if (combo % 3 === 0) spawn(box, 'shock b', x, y, '', [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${8 * power})`, opacity: 0 }], { duration: 700, delay: 60 });
  const n = Math.min(10, 5 + Math.floor(combo / 4));
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.25, v = 44 + Math.random() * 64 * power, dx = Math.cos(ang) * v, dy = Math.sin(ang) * v;
    spawn(box, 'coin', x - 7, y - 7, i % 4 === 0 ? '$' : '', [
      { transform: 'translate(0,0) scale(.6) rotate(0)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(1) rotate(${(Math.random() - .5) * 360}deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${dx * 1.15}px,${dy + 70}px) scale(.7) rotate(${(Math.random() - .5) * 540}deg)`, opacity: 0 }], { duration: 700 + Math.random() * 300 });
  }
  const jx = (Math.random() - .5) * 26;
  spawn(box, 'num', x + jx, y - 18, label, [
    { transform: 'translate(-50%,6px) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-14px) scale(1.25)', opacity: 1, offset: .2 },
    { transform: 'translate(-50%,-70px) scale(1)', opacity: 0 }], { duration: 900 });
}
