const CACHE = 'school-duel-v17';
const CORE = ['./school-duel.html','./manifest.json','./icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const isExternal = new URL(e.request.url).origin !== location.origin;
  if (isExternal) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  // Network-first: always fetch fresh, fall back to cache
  e.respondWith(fetch(e.request).then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
});
