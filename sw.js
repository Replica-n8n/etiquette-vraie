const CACHE_NAME = 'etiquette-vraie-1784220000';
const OFFLINE_URL = '/etiquette-vraie/index.html';

const urlsToCache = [
  '/etiquette-vraie/',
  '/etiquette-vraie/index.html',
  '/etiquette-vraie/style.css',
  '/etiquette-vraie/app.js',
  '/etiquette-vraie/rules.js',
  '/etiquette-vraie/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isLocalFile = url.hostname === 'localhost' || url.hostname === 'world.openfoodfacts.org' === false;
  const isJsOrCss = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html');
  const isOpenFoodFacts = url.hostname === 'world.openfoodfacts.org';

  // Strategy: Network-first for local JS/CSS/HTML files
  if (isLocalFile && isJsOrCss) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || new Response('Offline - file not cached', { status: 503 });
          });
        })
    );
  }
  // Strategy: Network-first for OpenFoodFacts API (with smart caching)
  else if (isOpenFoodFacts) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            if (response.status === 200) {
              return response.clone().json().then((data) => {
                if (data.status === 1) {
                  cache.put(event.request, response.clone());
                }
                return response;
              }).catch(() => {
                return response;
              });
            }
            return response;
          })
          .catch(() => {
            return cache.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return new Response(
                JSON.stringify({ status: 0, error: 'offline' }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            });
          });
      })
    );
  }
  // Default: cache-first for everything else
  else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
