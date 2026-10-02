/* Ashworth Station — offline cache.
   Precaches the page and the vendored engine on first visit; after that the
   game boots with no internet and an empty HTTP cache. Cache Storage is
   separate from, and far stickier than, the HTTP cache (Safari evicts it only
   after ~7 days of never visiting).

   Bump CACHE whenever index.html or anything in vendor/ changes — the old
   cache is deleted on activate, so a stale engine can never outlive its page. */
const CACHE = 'ashworth-v2';
const PRECACHE = [
  './',
  './index.html',
  './vendor/three.module.min.js',
  './vendor/RoomEnvironment.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(PRECACHE))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // never touch cross-origin

  /* Navigations (incl. ?query variants) answer from the cached page first:
     the whole point is booting while the network is gone. */
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(e.request)));
    return;
  }

  /* Same-origin assets: cache-first, runtime-caching anything not precached. */
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
    if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
    return resp;
  })));
});
