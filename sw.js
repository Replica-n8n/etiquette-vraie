const CACHE_NAME = 'etiquette-vraie-1786977036';
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
  // ⚠️ `addAll` est TOUT OU RIEN : une seule des huit URL en échec faisait
  // rejeter l'installation entière, donc pas de cache et donc pas de mode hors
  // ligne. On range chaque fichier séparément et on laisse passer les ratés.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      urlsToCache.map((url) => cache.add(url).catch(() => null)),
    )),
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
  // ⚠️ Écrit `a === b === false` à l'origine, ce qui se lit de travers : cela
  // signifiait « tout SAUF l'API d'Open Food Facts ». Même comportement, écrit
  // pour être compris.
  const isLocalFile = url.hostname !== 'world.openfoodfacts.org';
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
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
  }
  // Default: cache-first for everything else
  else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) return response;
        // ⚠️ SANS CE `catch`, UN RATÉ RÉSEAU REMONTE EN ERREUR NON GÉRÉE.
        // C'est par ici que passent les vignettes d'images.openfoodfacts.org,
        // celles des alternatives. Une seule manquante faisait rejeter
        // `respondWith` et salissait la console d'un « TypeError: Load failed »
        // intermittent. L'app le gérait déjà côté page (l'`onerror` de l'img
        // masque la vignette), le bruit venait uniquement d'ici.
        return fetch(event.request).catch(() => new Response('', { status: 503 }));
      })
    );
  }
});
