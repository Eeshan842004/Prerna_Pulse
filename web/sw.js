// Offline support. Network first, so changes always show when online; falls back to the saved copy
// when there is no internet (a school's Wi-Fi can drop). The API is never cached: with no server the
// page uses its in-browser engine instead.
const CACHE = 'prerana-v2-1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'img/icon-192.png', 'img/flow-band.png', 'img/flow-loop.png',
  'js/app.js', 'js/api.js', 'js/band.js', 'js/content.js', 'js/crypto.js', 'js/data.js', 'js/engine.js', 'js/i18n.js', 'js/model.js', 'js/ui.js',
  'js/views/apps.js', 'js/views/bandview.js', 'js/views/map.js', 'js/views/pages.js', 'js/views/story.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
