import { toast } from './ui.js';

const SPEC = { logo: { w: 320, h: 320 }, banner: { w: 1200, h: 400 } };
/** Resize in the browser (cover crop), then upload the small file. */
async function shrink(file, kind) {
  const { w, h } = SPEC[kind];
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('That file is not a picture we can read. Use PNG, JPG or WebP.');
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), s = Math.max(w / bmp.width, h / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  for (const [type, q] of [['image/webp', .86], ['image/jpeg', .86]]) {
    const blob = await new Promise(r => cv.toBlob(r, type, q));
    if (blob && blob.type === type) return blob;
  }
  throw new Error('Could not prepare the picture.');
}
export function pickAndUpload(kind, onDone) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.remove(); if (!f) return;
    try {
      if (f.size > 12e6) throw new Error('That picture is too large (max 12 MB).');
      const blob = await shrink(f, kind);
      const r = await fetch('/api/media/' + kind, { method: 'POST', headers: { 'content-type': blob.type }, body: blob, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      toast(kind === 'logo' ? 'Logo updated' : 'Banner updated', 'good'); onDone?.(j.url);
    } catch (e) { toast(e.message, 'err'); }
  });
  document.body.appendChild(inp); inp.click();
}
export async function removeMedia(kind, onDone) {
  try { const r = await fetch('/api/media/' + kind, { method: 'DELETE', credentials: 'same-origin' }); if (!r.ok) throw new Error('Could not remove it'); onDone?.(); } catch (e) { toast(e.message, 'err'); }
}
