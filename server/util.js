export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);

/** Trim, collapse whitespace, strip control chars, cap length. */
export function clean(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function cleanMultiline(v, max = 600) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r/g, '').trim().slice(0, max);
}
export function cleanUrl(v, { httpsOnly = false, max = 300 } = {}) {
  const s = clean(v, max);
  if (!s) return '';
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { throw bad('That link does not look valid'); }
  if (!(u.protocol === 'https:' || (!httpsOnly && u.protocol === 'http:'))) throw bad('Links must start with https://');
  if (!u.hostname.includes('.')) throw bad('That link does not look valid');
  return u.toString();
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';
export const toMicro = (usd) => BigInt(Math.round(Number(usd) * 1_000_000));
export const usd = (micro) => (Number(micro) / 1_000_000);
