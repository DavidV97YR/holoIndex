// holoIndex Service Worker
// Strategy:
//   - App shell (HTML, fonts): cache-first with background refresh
//   - CSV data sheets: stale-while-revalidate (instant on repeat visits)
//   - Everything else: network-first with cache fallback

const SHELL_CACHE = 'holoindex-shell-v1';
const DATA_CACHE  = 'holoindex-data-v1';

// Files that make up the app shell — cached on install for offline use
// Update SHELL_CACHE version string above whenever index.html changes
const SHELL_FILES = [
  '/holoIndex/',
  '/holoIndex/manifest.json'
];

const CSV_PATTERN = /docs\.google\.com.*output=csv/;
const FONT_PATTERN = /fonts\.(googleapis|gstatic)\.com/;

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
  );
});

// ── Activate: delete outdated caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !validCaches.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── Fetch: route requests by type ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // CSV data sheets — stale-while-revalidate
  // Serve cached version instantly, fetch fresh copy in background
  if (CSV_PATTERN.test(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Google Fonts — cache-first (font files never change for a given URL)
  if (FONT_PATTERN.test(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // App shell HTML — cache-first with background refresh
  if (request.mode === 'navigate' || SHELL_FILES.some(f => url.includes(f))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else — network-first, fall back to cache
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────

// Serve from cache instantly; update cache in background
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      const fresh = fetch(request)
        .then(resp => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        })
        .catch(() => cached); // if network fails, the in-flight promise resolves to cached
      return cached || fresh;
    })
  );
}

// Serve from cache; only hit network if not cached
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp.ok) cache.put(request, resp.clone());
        return resp;
      });
    })
  );
}

// Hit network first; fall back to cache if offline
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
