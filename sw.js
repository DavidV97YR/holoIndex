// holoIndex Service Worker
// Strategy:
//   - App shell (HTML, CSS, JS, fonts): cache-first with background refresh
//   - CSV data sheets: stale-while-revalidate (instant load, fresh in background)
//   - Images (avatars, event images): cache-first (immutable URLs)
//   - Everything else: network-first with cache fallback

const SHELL_CACHE = 'holoindex-shell-v4';
const DATA_CACHE  = 'holoindex-data-v2';
const IMG_CACHE   = 'holoindex-img-v2';

const SHELL_FILES = [
  '/holoIndex/',
  '/holoIndex/index.html',
  '/holoIndex/about.html',
  '/holoIndex/styles.css',
  '/holoIndex/shared.js',
  '/holoIndex/app.js',
  '/holoIndex/manifest.json',
  '/holoIndex/favicon.ico',
  '/holoIndex/icons/icon-192.png',
  '/holoIndex/icons/icon-512.png'
];

const CSV_PATTERN     = /docs\.google\.com.*output=csv/;
const FONT_PATTERN    = /fonts\.(googleapis|gstatic)\.com/;
const R2_DOMAIN       = 'pub-c5822af30923465a9d44f6fb66d71da6.r2.dev';
const CDN_IMG_PATTERN = new RegExp(R2_DOMAIN.replace(/\./g, '\\.'));

const MAX_IMG_BYTES = 100 * 1024 * 1024; // 100 MB (shared across origin)

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [SHELL_CACHE, DATA_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !validCaches.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  if (CSV_PATTERN.test(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (FONT_PATTERN.test(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (CDN_IMG_PATTERN.test(url)) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }

  if (request.mode === 'navigate' || SHELL_FILES.some(f => url.includes(f))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      const fresh = fetch(request)
        .then(resp => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
}

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp.ok) {
          cache.put(request, resp.clone());
          if (cacheName === IMG_CACHE) trimCache(IMG_CACHE);
        }
        return resp;
      });
    })
  );
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(resp => {
      if (resp.ok) {
        caches.open(cacheName).then(cache => cache.put(request, resp.clone()));
      }
      return resp;
    })
    .catch(() => caches.match(request));
}

// ── Cache size trim (size-based, FIFO) ───────────────────────────────────────
async function trimCache(cacheName) {
  const estimate = await navigator.storage.estimate();
  const used = estimate.usage || 0;
  if (used < MAX_IMG_BYTES) return;

  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  for (const key of keys) {
    await cache.delete(key);
    const newEstimate = await navigator.storage.estimate();
    if ((newEstimate.usage || 0) < MAX_IMG_BYTES) break;
  }
}
