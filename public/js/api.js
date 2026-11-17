let onUnauth = () => {};
export const setUnauthHandler = (fn) => { onUnauth = fn; };

export async function api(method, path, body) {
  let r;
  try {
    r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch { throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 }); }
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/api/auth/')) onUnauth();
    throw Object.assign(new Error(json?.error || `Request failed (${r.status})`), { status: r.status });
  }
  return json;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b || {});
