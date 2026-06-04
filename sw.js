/* ============================================================
   FAMILY OPERATIONS CENTER — sw.js
   Service Worker — offline caching
   ============================================================ */

const CACHE_NAME = 'family-ops-v1';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './backup.js',
  './manifest.json',
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin assets
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache new successful responses for app assets
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // If offline and not cached, return offline page
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
