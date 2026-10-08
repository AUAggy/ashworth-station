/* Ashworth Station — offline cache.
   Precaches the page and the vendored engine on first visit; after that the
   game boots with no internet and an empty HTTP cache. Cache Storage is
   separate from the HTTP cache, but browsers or users may clear it.

   Bump CACHE whenever index.html or anything in vendor/ changes — the old
   cache is deleted on activate, so a stale engine can never outlive its page. */
const CACHE = 'ashworth-v11';
const PRECACHE = [
  './',
  './index.html',
  './vendor/three.module.min.js',
  './vendor/RoomEnvironment.js'
];
const PRECACHE_URLS = new Set(PRECACHE.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(PRECACHE))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('ashworth-') && k !== CACHE)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // never touch cross-origin

  /* Navigations (incl. ?query variants) answer from the cached page first:
     the whole point is booting while the network is gone. */
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(CACHE)
      .then(c => c.match('./index.html'))
      .then(r => r || fetch(e.request)));
    return;
  }

  /* Only exact pre-cache assets belong to this worker. No runtime growth or
     query-variant asset caching, and no lookup in another app's cache. */
  if (!PRECACHE_URLS.has(url.href)) return;
  e.respondWith(caches.open(CACHE)
    .then(c => c.match(e.request))
    .then(r => r || fetch(e.request)));
});
