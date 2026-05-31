// holoIndex Service Worker
// Strategy:
//   - App shell (HTML, CSS, JS, fonts): cache-first with background refresh
//   - CSV data sheets: stale-while-revalidate (instant load, fresh in background)
//   - Images (avatars, event images): cache-first (immutable URLs)
//   - Everything else: network-first with cache fallback

// ── VERSIONING ──
// Bump SHELL_CACHE whenever any file in SHELL_FILES changes (HTML/CSS/JS).
// Bump DATA_CACHE only if the CSV cache layout itself changes (rare).
const SHELL_CACHE = 'holoindex-shell-v3';
const DATA_CACHE  = 'holoindex-data-v2';
const IMG_CACHE   = 'holoindex-img-v1';

// App shell — cached on install for offline use.
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

const CSV_PATTERN  = /docs\.google\.com.*output=csv/;
const FONT_PATTERN = /fonts\.(googleapis|gstatic)\.com/;

const MAX_IMG_ENTRIES = 300;

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete outdated caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [SHELL_CACHE, DATA_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !validCaches.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests by type ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // CSV data sheets — stale-while-revalidate
  if (CSV_PATTERN.test(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Google Fonts — cache-first
  if (FONT_PATTERN.test(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, false));
    return;
  }

  // Images — cache-first (avatar/event images from AvatarURL/ImageURL fields)
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMG_CACHE, true));
    return;
  }

  // App shell — cache-first with background refresh
  if (request.mode === 'navigate' || SHELL_FILES.some(f => url.includes(f))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, false));
    return;
  }

  // Everything else — network-first, fall back to cache
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

function cacheFirst(request, cacheName, trim) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp.ok) {
          cache.put(request, resp.clone());
          if (trim) trimCache(cacheName, MAX_IMG_ENTRIES);
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

// ── Cache size trim (FIFO) ────────────────────────────────────────────────────
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}
