const CACHE_NAME = 'etiquette-vraie-1786721291';
// Chemins RELATIFS (résolus par rapport à l'emplacement de sw.js) pour que
// l'app fonctionne à n'importe quelle URL (prod, sous-dossier, dépôt de test).
const OFFLINE_URL = './index.html';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './rules.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
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
  // Le décodeur ZXing pèse ~1 Mo. Il tomberait dans la branche par défaut
  // ci-dessous, qui va bien le chercher sur le réseau quand il n'est pas en
  // cache mais ne RANGE JAMAIS le résultat : il serait retéléchargé à chaque
  // ouverture de l'app, en données mobiles, et rien ne fonctionnerait hors
  // ligne. On le met donc en cache dès la première demande.
  // Volontairement absent de urlsToCache : un Android ne l'exécute jamais et
  // n'a aucune raison de le télécharger à l'installation.
  else if (url.pathname.endsWith('.wasm')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
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
