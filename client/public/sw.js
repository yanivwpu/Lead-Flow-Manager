const CACHE_NAME = 'chatcrm-v5';
const urlsToCache = [
  '/favicon.png',
  '/pwa-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Never cache API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Never cache webhooks
  if (url.pathname.startsWith('/webhooks/') || url.pathname.includes('/webhook')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Never cache auth routes
  if (url.pathname.startsWith('/auth')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Never cache Shopify routes
  if (url.pathname.startsWith('/shopify')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Homepage - network-first for fresh SSR content
  if (url.pathname === '/' || url.pathname === '') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Blog pages - network-first for fresh SSR content
  if (url.pathname.startsWith('/blog')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Network-first for everything else
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
