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

// --- Contribution à Open Food Facts -----------------------------------------
// Permet à l'utilisateur d'enrichir OFF (produit absent / fiche incomplète)
// sans créer de compte : on passe par le compte "global app" d'Étiquette Vraie.
// Les identifiants restent des SECRETS Cloudflare (env) - jamais dans l'app,
// qui est publique. Chaque envoi porte un app_uuid anonyme par utilisateur,
// pour qu'OFF puisse bannir un fautif sans bannir toute l'app.
const APP_NAME = 'EtiquetteVraie';
const APP_VERSION = '1.0';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~4,5 Mo de photo réelle

function offBase(env) {
  // Par défaut : serveur de TEST d'OFF. Passer OFF_BASE à l'URL de prod
  // (https://world.openfoodfacts.org) seulement quand tout est validé.
  return (env && env.OFF_BASE) || 'https://world.openfoodfacts.net';
}

// data:image/jpeg;base64,xxxx -> Blob
function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > MAX_IMAGE_BYTES) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

async function handleContribute(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env || !env.OFF_USER_ID || !env.OFF_PASSWORD) {
    return json({ error: 'not-configured' }, 503);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad-json' }, 400); }

  const code = String(body.code || '').trim();
  if (!/^\d{8,14}$/.test(code)) return json({ error: 'bad-code' }, 400);

  const name = String(body.product_name || '').trim().slice(0, 200);
  const lang = /^[a-z]{2}$/.test(body.lang || '') ? body.lang : 'fr';
  // uuid anonyme fourni par l'app (aucune donnée perso)
  const uuid = String(body.uuid || 'anon').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);

  const base = offBase(env);
  const auth = { user_id: env.OFF_USER_ID, password: env.OFF_PASSWORD };
  const identity = { app_name: APP_NAME, app_version: APP_VERSION, app_uuid: uuid };
  const result = { base, code };

  // 1) Champs texte (nom du produit) - seulement si fourni
  if (name) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...auth, ...identity, code, lang })) form.append(k, v);
    form.append('product_name', name);
    try {
      const res = await fetch(`${base}/cgi/product_jqm2.pl`, {
        method: 'POST', body: form,
        headers: { 'User-Agent': `${APP_NAME}/${APP_VERSION} (etiquette-vraie)` },
      });
      const txt = await res.text();
      let parsed; try { parsed = JSON.parse(txt); } catch (e) { parsed = { raw: txt.slice(0, 200) }; }
      result.fields = { http: res.status, status: parsed.status, message: parsed.status_verbose || parsed.raw };
    } catch (e) {
      result.fields = { error: e.message };
    }
  }

  // 2) Photo des ingrédients - c'est elle qui a le plus de valeur : OFF en
  // extrait le texte (OCR) puis en déduit additifs, allergènes, NOVA...
  if (body.image) {
    const blob = dataUrlToBlob(body.image);
    if (!blob) return json({ ...result, error: 'bad-image' }, 400);
    const field = `ingredients_${lang}`;
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...auth, ...identity, code })) form.append(k, v);
    form.append('imagefield', field);
    form.append(`imgupload_${field}`, blob, 'ingredients.jpg');
    try {
      const res = await fetch(`${base}/cgi/product_image_upload.pl`, {
        method: 'POST', body: form,
        headers: { 'User-Agent': `${APP_NAME}/${APP_VERSION} (etiquette-vraie)` },
      });
      const txt = await res.text();
      let parsed; try { parsed = JSON.parse(txt); } catch (e) { parsed = { raw: txt.slice(0, 200) }; }
      result.image = { http: res.status, status: parsed.status, error: parsed.error, message: parsed.status_verbose || parsed.raw };
    } catch (e) {
      result.image = { error: e.message };
    }
  }

  if (!name && !body.image) return json({ error: 'nothing-to-send' }, 400);
  result.ok = !!((result.fields && result.fields.status === 1) || (result.image && !result.image.error));
  return json(result);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === '/contribute') return handleContribute(request, env);
    if (url.pathname !== '/search') {
      return new Response('Etiquette Vraie proxy — /search?q=... ou POST /contribute', { headers: CORS });
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
