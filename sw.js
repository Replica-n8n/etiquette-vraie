const VERSION = 'etiquette-vraie-1789663842';
// Toutes nos apps partagent l'origine replica-n8n.github.io, donc le même
// CacheStorage. Le cache porte le nom de l'app ET de sa portée (prod et
// dépôt de test ont chacun le leur), et l'activation ne supprime QUE les
// siens : avant, chaque mise à jour effaçait le hors ligne de GVT, de La Cour
// et des jeux. Les anciens noms `etiquette-vraie-<tampon>` sont nettoyés une
// dernière fois, ceux du dépôt de test compris : c'est la même app.
const PREFIXE = 'ev:' + new URL(self.registration.scope).pathname + ':';
const CACHE_NAME = PREFIXE + VERSION;
const ANCIEN = 'etiquette-vraie-';
// Chemins RELATIFS (résolus par rapport à l'emplacement de sw.js) pour que
// l'app fonctionne à n'importe quelle URL (prod, sous-dossier, dépôt de test).
const OFFLINE_URL = './index.html';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './rules.js',
  './polices/space-grotesk-variable.woff2',
  './polices/inter-variable.woff2',
  './polices/ibm-plex-mono-400.woff2',
  './polices/ibm-plex-mono-500.woff2',
  './polices/ibm-plex-mono-600.woff2',
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
        cacheNames
          .filter((k) => (k.startsWith(PREFIXE) && k !== CACHE_NAME) || k.startsWith(ANCIEN))
          .map((k) => caches.delete(k))
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

  // Navigation : le réseau d'abord, revalidé (`no-cache` : Pages garde le HTML
  // 10 minutes en cache HTTP), rangée pour le hors ligne, la coquille sinon.
  // Avant, `./` tombait dans la branche « cache d'abord » : la page restait
  // celle de l'installation tant qu'on ne rechargeait pas deux fois.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
            return response;
          })
          .catch(() => cache.match(event.request, { ignoreSearch: true })
            .then((hit) => hit || cache.match(OFFLINE_URL)))
      )
    );
    return;
  }

  // Strategy: Network-first for local JS/CSS/HTML files
  if (isLocalFile && isJsOrCss) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // ⚠️ La copie se fait TOUT DE SUITE : faite plus tard dans le
          // `then` de caches.open, elle arrivait après la lecture du corps par
          // la page, levait « body already used » en silence, et rien n'était
          // jamais rangé. Hors ligne, `style.css?v=…` et `app.js?v=…`
          // manquaient donc : la page s'ouvrait sans style ni script.
          if (response.status === 200) {
            const copie = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          // `ignoreSearch` : l'installation range `./style.css`, la page demande
          // `./style.css?v=<tampon>`. Même lot de fichiers, même version.
          return caches.open(CACHE_NAME).then((cache) => cache.match(event.request, { ignoreSearch: true })).then((cachedResponse) => {
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
  // Les polices hébergées : cache d'abord, et rangées si elles manquaient
  // (une installation interrompue n'aurait plus jamais de police hors ligne).
  else if (url.pathname.endsWith('.woff2')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
          return response;
        }))
      )
    );
  }
  // Default: cache-first for everything else
  else {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => cache.match(event.request)).then((response) => {
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
