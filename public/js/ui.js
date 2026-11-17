import { $, esc, ic } from './util.js';

export function toast(msg, kind = '') {
  const box = $('#toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = `toast ${kind}`;
  t.innerHTML = (kind === 'good' ? ic('check', 17, '', 2.4) : kind === 'err' ? ic('info', 17, '', 2.2) : '') + `<span>${esc(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 4200 : 3000);
}

/** Bottom sheet (or centered dialog). Returns { el, close }. Content is trusted HTML built with esc(). */
export function sheet(html, { center = false, onClose } = {}) {
  const ov = document.createElement('div'); ov.className = 'overlay' + (center ? ' center' : '');
  ov.innerHTML = `<div class="sheet">${center ? '' : '<div class="grab"></div>'}${html}</div>`;
  const close = () => { ov.remove(); onClose?.(); };
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(ov);
  return { el: ov.firstElementChild, close };
}

export function pageHeader(title, { back = true, right = '' } = {}) {
  return `<div class="sub-h">${back ? `<button class="iconbtn" data-act="back" aria-label="Back">${ic('chevron-left', 20, '', 2.2)}</button>` : ''}<h1 class="grow ell">${esc(title)}</h1>${right}</div>`;
}
/** Large page title used by the top-level tabs. */
export const titleBlock = (title, sub = '', right = '') => `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right}</div>`;
export const section = (title, right = '') => `<div class="sect"><h2>${esc(title)}</h2>${right}</div>`;
