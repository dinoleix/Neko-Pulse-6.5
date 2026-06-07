// Bump this version whenever the caching logic changes — the activate handler
// deletes any cache that isn't the current name, flushing stale shells.
const CACHE_NAME = 'neko-pulse-v2';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  // Take over as soon as installed instead of waiting for every tab to close,
  // so fixes actually reach staff phones on their next app open.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever touch same-origin GETs. Firebase/Firestore/Storage, the QR image
  // API and the geo-IP lookup are cross-origin and must always hit the network.
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Network-first for page navigations: always try to fetch the freshest
  // index.html so a new deploy is picked up immediately. Only fall back to the
  // cached shell when the network is unavailable (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for everything else. Vite asset filenames are content-hashed,
  // so a cached asset is only ever served for the exact build it belongs to.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
