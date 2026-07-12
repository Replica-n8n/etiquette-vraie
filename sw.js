const CACHE_NAME = 'etiquette-vraie-v1';
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

  if (url.hostname === 'world.openfoodfacts.org') {
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
  } else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
