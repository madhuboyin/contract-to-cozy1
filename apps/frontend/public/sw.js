const CACHE_NAME = 'c2c-v1.3.0';

// The only HTML document this worker caches: a static "you're offline" shell
// served when a navigation cannot reach the network. It carries no user data.
const OFFLINE_URL = '/offline';

// Only cache immutable Next.js static chunks and the offline shell — never
// dynamic HTML, RSC payloads, or API responses.
function isImmutableAsset(url) {
  const path = new URL(url).pathname;
  return path.startsWith('/_next/static/');
}

// Prune oldest entries when a cache exceeds maxEntries.
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

// Install — precache the offline fallback shell, then activate immediately.
// The precache is best-effort: if it fails (e.g. installed while offline),
// installation still succeeds and the fetch handler simply has no fallback
// until the next successful update.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch (err) {
        // best-effort — ignore
      }
      await self.skipWaiting();
    })()
  );
});

// Activate — clear all old caches and take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Let the browser handle cross-origin requests normally.
  if (!url.startsWith(self.location.origin)) return;

  const { pathname, search } = new URL(url);

  // Navigations: go straight to the network, exactly as before — the online
  // path is unchanged and server redirects (auth, etc.) are still followed by
  // the browser because fetch() of a navigation yields an opaque redirect that
  // respondWith passes through untouched. The ONLY added behaviour is that a
  // network failure now falls back to the cached offline shell instead of the
  // browser's default error page. .catch() fires only on a network-layer
  // failure; HTTP error responses (4xx/5xx) still resolve and pass through.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }).then(
          (cached) => cached || Response.error()
        )
      )
    );
    return;
  }

  // Never intercept: RSC requests, API calls, or monitoring. Letting these
  // fall through to the network ensures fresh server state always works.
  if (
    search.includes('_rsc=') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/monitoring')
  ) {
    return;
  }

  // Cache-first for immutable _next/static/ chunks (content-hashed filenames).
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
              trimCache(CACHE_NAME, 200);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Only handle known static assets (icons, fonts, manifest, images).
  // Let everything else — including page routes — pass through to the network.
  const isStaticAsset = (
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.svg' ||
    /\.(woff2?|ttf|otf|eot)$/.test(pathname)
  );
  if (!isStaticAsset) return;

  // Network first, cache fallback for static assets.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
            trimCache(CACHE_NAME, 60);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || new Response('', { status: 503 })))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Contract to Cozy', {
      body: data.body || 'You have a new notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      data: data.url || '/dashboard',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/dashboard'));
});
