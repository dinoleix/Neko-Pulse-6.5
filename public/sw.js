// Bump this version whenever the caching logic changes — the activate handler
// deletes any cache that isn't the current name, flushing stale shells.
const CACHE_NAME = 'neko-pulse-v4';
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

  // Vite serves un-hashed source modules during local development. Caching
  // those modules lets an old export survive a refresh and can leave the app
  // blank after a code edit. Production assets are content-hashed, so keep
  // the offline cache there while always using the live dev server locally.
  if (self.location.hostname === '127.0.0.1' || self.location.hostname === 'localhost') return;

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
  // Private API responses include expiring playback links and must never be
  // reused across requests or accounts, regardless of HTTP cache headers.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

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

  // Only cache the build's static assets; other responses may be user-specific.
  if (!url.pathname.startsWith('/assets/')) return;
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
