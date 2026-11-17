// Network-first for everything on this origin (the game is live data); cached shell is only a fallback when offline.
const V = 'np-v2';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then(c => c.addAll(['/', '/app.css', '/theme.css', '/js/main.js', '/brand/logo-white.png'])).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/go/') || u.pathname.startsWith('/c/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
