const CACHE_NAME = 'c2c-v1.4.0';

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

// Install — precache the offline fallback shell. The precache is best-effort:
// if it fails (e.g. installed while offline), installation still succeeds and
// the fetch handler simply has no fallback until the next successful update.
//
// NOTE: no self.skipWaiting() here. A new worker waits until the page tells it
// to take over (the "Update available" toast → applyServiceWorkerUpdate() in
// lib/pwa.ts → SKIP_WAITING message below). The first-ever install still
// activates promptly because there is no controlled page to wait behind.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch (err) {
        // best-effort — ignore
      }
    })()
  );
});

// The page asks a waiting worker to activate only when the user accepts the
// update toast. Until then the current worker keeps serving the session.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate — clear old caches, enable navigation preload, take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );

      // Navigation preload lets the browser start the navigation request in
      // parallel with the worker boot. Since this worker intercepts every
      // navigation (for the offline fallback), without preload the boot and
      // the fetch would run serially — a latency tax on every navigation.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (err) {
          // not fatal — falls back to a plain fetch()
        }
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Let the browser handle cross-origin requests normally.
  if (!url.startsWith(self.location.origin)) return;

  const { pathname, search } = new URL(url);

  // Navigations: online behaviour is unchanged — the navigation-preload
  // response (or a plain fetch) goes straight back to the browser, and server
  // redirects (auth, etc.) are still followed because a navigation fetch yields
  // an opaque redirect that respondWith passes through untouched. The ONLY
  // added behaviour: a network-layer failure falls back to the cached offline
  // shell instead of the browser's default error page. HTTP 4xx/5xx still
  // resolve and pass through — only a thrown/rejected fetch hits the catch.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Prefer the browser's parallel navigation-preload response, then a
          // plain network fetch. Both yield an opaque redirect for auth 3xx,
          // which respondWith() passes through to the browser untouched.
          const preload = await event.preloadResponse;
          if (preload) return preload;
          return await fetch(event.request);
        } catch (err) {
          // Network-layer failure only (HTTP 4xx/5xx still resolve above).
          const cached = await caches.match(OFFLINE_URL, { ignoreSearch: true });
          return cached || Response.error();
        }
      })()
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
