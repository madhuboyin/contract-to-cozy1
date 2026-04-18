const CACHE_NAME = 'c2c-v1.1.1';

// Only cache immutable Next.js static chunks — never HTML, RSC, or API responses.
function isImmutableAsset(url) {
  const path = new URL(url).pathname;
  return path.startsWith('/_next/static/');
}

// Install — nothing to precache, just activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
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

  // Never intercept: navigations, RSC requests, API calls, or monitoring.
  // Letting these fall through to the network ensures auth redirects and
  // fresh server state always work correctly.
  const { pathname, search } = new URL(url);
  if (
    event.request.mode === 'navigate' ||
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
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
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
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
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
