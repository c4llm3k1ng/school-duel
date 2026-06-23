const CACHE = 'school-duel-v32';
const CORE = ['./school-duel.html','./manifest.json','./icon.jpg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const isExternal = new URL(e.request.url).origin !== location.origin;
  if (isExternal) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  // Network-first mit Revalidierung: HTTP-Cache umgehen (cache:'no-cache'),
  // damit Updates sofort ankommen statt bis zu 10 Min aus dem Browser-Cache.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
});
