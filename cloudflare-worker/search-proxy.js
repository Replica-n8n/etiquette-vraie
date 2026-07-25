// Étiquette Vraie — proxy de recherche Open Food Facts (Cloudflare Worker)
//
// Pourquoi : la NOUVELLE API de recherche d'OFF (search.openfoodfacts.org) est
// fiable, mais refuse les appels directs depuis un navigateur (CORS). Un Worker
// (serveur) a le droit de l'appeler ; il met le résultat en cache à la
// périphérie Cloudflare et le renvoie à l'app avec les bons en-têtes CORS.
//
// Usage depuis l'app :  https://<ton-worker>.workers.dev/search?q=nutella
// Renvoie : { products: [ { code, product_name, brands, image_front_small_url,
//                           lang, languages_tags, countries_tags }, ... ] }

const OFF_SEARCH = 'https://search.openfoodfacts.org/search';
const FIELDS = 'code,product_name,brands,image_front_small_url,lang,languages_tags,countries_tags';
const CACHE_TTL = 21600; // 6 h — les recettes changent lentement

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname !== '/search') {
      return new Response('Etiquette Vraie search proxy — utilise /search?q=...', { headers: CORS });
    }

    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json({ products: [] });

    const pageSize = Math.min(parseInt(url.searchParams.get('page_size') || '40', 10) || 40, 50);
    const offUrl = `${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=${pageSize}&fields=${FIELDS}`;

    try {
      const res = await fetch(offUrl, {
        headers: { 'User-Agent': 'EtiquetteVraie/1.0 (Cloudflare search proxy)' },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true }, // cache à la périphérie
      });
      if (!res.ok) return json({ products: [], error: 'off-error', status: res.status });

      const data = await res.json();
      const products = (data.hits || [])
        .filter((p) => p && p.product_name)
        .map((p) => ({
          ...p,
          // La nouvelle API renvoie brands en liste ; l'app attend un texte.
          brands: Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || ''),
        }));

      return json({ products });
    } catch (e) {
      return json({ products: [], error: 'off-unreachable' });
    }
  },
};
