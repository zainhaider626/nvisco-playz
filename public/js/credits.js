import { esc } from './util.js';
const box = document.getElementById('list');
fetch('/photos/manifest.json').then(r => r.json()).then(m => {
  const rows = Object.entries(m);
  box.innerHTML = rows.length ? rows.map(([id, c]) => `<div class="row2"><b>${esc(c.title)}</b>${esc(c.author)} · ${esc(c.license)} · <a href="${esc(c.page)}" rel="noopener">source</a></div>`).join('') : 'No photos have been downloaded yet.';
}).catch(() => { box.textContent = 'Could not load the credits.'; });
