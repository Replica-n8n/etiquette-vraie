// Non-régression du Worker Cloudflare (cloudflare-worker/search-proxy.js).
// Lancer :  node test-worker.mjs
//
// Le Worker se colle À LA MAIN dans le dashboard Cloudflare : il n'y a ni build
// ni CI pour l'attraper. Ce fichier vérifie donc ce qu'il ENVOIE à Open Food
// Facts, en remplaçant `fetch` par un espion — aucune requête réseau réelle.
//
// Ce qu'on protège en priorité : la contribution écrit dans une base PUBLIQUE.
// Une erreur de nom de champ n'échoue pas, elle détruit les données de
// quelqu'un d'autre en silence. Voir le cas `add_brands` ci-dessous.

import { readFile } from 'node:fs/promises';

const SRC = new URL('./cloudflare-worker/search-proxy.js', import.meta.url);

// Le Worker est un module ES ; le repo n'a pas de package.json (donc pas de
// "type": "module"), un `import` direct du .js le lirait comme du CommonJS.
// On l'importe par data-URL : pas de copie temporaire, pas de fichier en trop.
const source = await readFile(SRC, 'utf8');
const worker = (await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source))).default;

const ENV = {
  OFF_USER_ID: 'juoff',
  OFF_PASSWORD: 'secret',
  OFF_BASE: 'https://world.openfoodfacts.net', // serveur de test : rien d'écrit
};

// Espion : capture les appels sortants et renvoie une réponse OFF plausible.
let calls = [];
function spyFetch(okBody = { status: 1, status_verbose: 'fields saved' }) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const entry = { url: String(url), headers: options.headers || {}, fields: {} };
    if (options.body instanceof FormData) {
      for (const [k, v] of options.body.entries()) {
        entry.fields[k] = typeof v === 'string' ? v : `[blob ${v.size}]`;
      }
    }
    calls.push(entry);
    return new Response(JSON.stringify(okBody), { status: 200 });
  };
}

const contribute = (body) =>
  worker.fetch(
    new Request('https://w.dev/contribute', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    ENV,
  );

let pass = 0;
const failures = [];
function check(nom, condition, detail = '') {
  if (condition) { pass++; return; }
  failures.push(`${nom}${detail ? ' — ' + detail : ''}`);
}

// --- 1. Le champ marque ne doit JAMAIS écraser la liste existante -----------
// `brands=X` REMPLACE toute la liste chez OFF (« Ferrero, Nutella » -> « Nutella »).
// Seul `add_brands` ajoute. C'est la régression la plus coûteuse du fichier :
// elle est invisible côté app et détruit du travail bénévole côté OFF.
spyFetch();
await contribute({ code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero' });
const post = calls.find((c) => c.url.includes('product_jqm2.pl'));
check('contribution : un POST champs est bien envoyé', !!post);
check('marque envoyée en add_brands', post && post.fields.add_brands === 'Ferrero', post && JSON.stringify(post.fields));
check('AUCUN champ `brands` brut (il écraserait la liste)', post && post.fields.brands === undefined);
check('le nom passe toujours', post && post.fields.product_name === 'Nutella');
check('le code passe toujours', post && post.fields.code === '3017620422003');
check("l'uuid anonyme est transmis", post && post.fields.app_uuid === 'anon');

// --- 2. User-Agent : OFF exige une adresse de contact ------------------------
// `AppName/Version (ContactEmail)`. Sans adresse, OFF n'a aucun moyen de nous
// prévenir avant de bloquer le client — il bloque, simplement.
const ua = (c) => (c.headers['User-Agent'] || '');
check('UA de la contribution : contient un email', /\S+@\S+\.\S+/.test(ua(post)), ua(post));
check('UA de la contribution : plus le libellé sans adresse', !ua(post).includes('(etiquette-vraie)'));

spyFetch({ status: 200 });
await worker.fetch(new Request('https://w.dev/auth-check'), ENV);
check('UA de /auth-check : contient un email', calls[0] && /\S+@\S+\.\S+/.test(ua(calls[0])), calls[0] && ua(calls[0]));

spyFetch({ hits: [{ code: '1', product_name: 'Test', brands: ['A', 'B'] }] });
await worker.fetch(new Request('https://w.dev/search?q=nutella'), ENV);
check('UA de /search : contient un email', calls[0] && /\S+@\S+\.\S+/.test(ua(calls[0])), calls[0] && ua(calls[0]));

// --- 3. Non-régression : le reste du Worker n'a pas bougé -------------------
spyFetch({ hits: [{ code: '1', product_name: 'Test', brands: ['Ferrero', 'Nutella'] }] });
const searchRes = await worker.fetch(new Request('https://w.dev/search?q=nutella'), ENV);
const searchJson = await searchRes.json();
check('recherche : brands liste -> texte', searchJson.products[0].brands === 'Ferrero, Nutella', JSON.stringify(searchJson.products[0]));
check('recherche : CORS ouvert', searchRes.headers.get('Access-Control-Allow-Origin') === '*');

spyFetch();
const badCode = await contribute({ code: 'abc', product_name: 'X' });
check('contribution : code invalide rejeté', badCode.status === 400);
check('contribution : rien envoyé sur code invalide', calls.length === 0);

spyFetch();
const rien = await contribute({ code: '3017620422003' });
check('contribution : rien à envoyer -> 400', rien.status === 400);

// Photo seule : le chemin qui a le plus de valeur pour OFF (OCR + Robotoff).
spyFetch();
const pixel = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(40)).toString('base64');
await contribute({ code: '3017620422003', image: pixel, lang: 'fr' });
const up = calls.find((c) => c.url.includes('product_image_upload.pl'));
check('photo : envoyée sur le bon champ', up && up.fields.imagefield === 'ingredients_fr', up && JSON.stringify(up.fields));
check('photo : UA avec email', up && /\S+@\S+\.\S+/.test(ua(up)));

// La racine sert de témoin de version : c'est le seul moyen de savoir quelle
// version est réellement déployée (le code se colle à la main).
spyFetch();
const root = await worker.fetch(new Request('https://w.dev/'), ENV);
const rootText = await root.text();
check('racine : affiche une version bumpée', /w[3-9]\d*-/.test(rootText), rootText);

// --- 4. La liste d'ingrédients : écrire OUI, écraser NON ---------------------
// Même famille de piège que `brands` : `ingredients_text` est un champ TEXTE,
// il n'a pas de variante `add_`, donc tout envoi REMPLACE. Sur une fiche vide
// c'est un cadeau ; sur une fiche remplie c'est une destruction silencieuse.

// Espion qui sait répondre DEUX choses : l'état actuel de la fiche (GET api/v2)
// et le résultat de l'écriture (POST product_jqm2).
function spyAvecEtat(ingredientsExistants) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const entry = { url: u, headers: options.headers || {}, fields: {} };
    if (options.body instanceof FormData) {
      for (const [k, v] of options.body.entries()) {
        entry.fields[k] = typeof v === 'string' ? v : `[blob ${v.size}]`;
      }
    }
    calls.push(entry);
    if (u.includes('/api/v2/product/')) {
      const p = ingredientsExistants ? { ingredients_text_fr: ingredientsExistants } : {};
      return new Response(JSON.stringify({ status: 1, product: p }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 1, status_verbose: 'fields saved' }), { status: 200 });
  };
}

// 4a. Fiche VIDE : on écrit, et sur le champ suffixé par la langue.
spyAvecEtat(null);
const vide = await contribute({ code: '0752612000113', ingredients_text: 'Cacao alcalinisé, Carbonate de potassium.', lang: 'fr' });
const ecrit = calls.find((c) => c.url.includes('product_jqm2.pl'));
check('ingrédients : fiche vide -> écriture envoyée', !!ecrit);
check('ingrédients : champ suffixé par la langue', ecrit && ecrit.fields.ingredients_text_fr === 'Cacao alcalinisé, Carbonate de potassium.', ecrit && JSON.stringify(ecrit.fields));
check('ingrédients : aucun champ `ingredients_text` sans langue', ecrit && ecrit.fields.ingredients_text === undefined);
check('ingrédients : fiche vide -> réponse OK', vide.status === 200);
check("ingrédients : l'état est lu AVANT d'écrire", calls.length >= 2 && calls[0].url.includes('/api/v2/product/'), JSON.stringify(calls.map((c) => c.url)));

// 4b. Fiche DÉJÀ REMPLIE : refus net, et surtout AUCUNE écriture.
spyAvecEtat('Cacao, sucre.');
const pleine = await contribute({ code: '0752612000113', ingredients_text: 'autre chose', lang: 'fr' });
check('ingrédients : fiche déjà remplie -> 409', pleine.status === 409, String(pleine.status));
check("ingrédients : fiche déjà remplie -> RIEN n'est écrit", !calls.some((c) => c.url.includes('product_jqm2.pl')), JSON.stringify(calls.map((c) => c.url)));
const corps = await pleine.json();
check('ingrédients : le refus dit ce qui est déjà là', corps.existant === 'Cacao, sucre.', JSON.stringify(corps));

// 4c. Correction assumée : il faut la demander explicitement.
spyAvecEtat('Cacao, sucre.');
await contribute({ code: '0752612000113', ingredients_text: 'Cacao alcalinisé.', lang: 'fr', overwrite_ingredients: true });
const corrige = calls.find((c) => c.url.includes('product_jqm2.pl'));
check('ingrédients : correction explicite -> écriture envoyée', corrige && corrige.fields.ingredients_text_fr === 'Cacao alcalinisé.', corrige && JSON.stringify(corrige.fields));

// 4d. Sans état lisible, on n'écrit pas : ne jamais deviner.
calls = [];
globalThis.fetch = async (url) => {
  calls.push({ url: String(url) });
  if (String(url).includes('/api/v2/product/')) throw new Error('reseau');
  return new Response(JSON.stringify({ status: 1 }), { status: 200 });
};
const aveugle = await contribute({ code: '0752612000113', ingredients_text: 'X', lang: 'fr' });
check('ingrédients : état illisible -> 502, aucune écriture', aveugle.status === 502 && !calls.some((c) => c.url.includes('product_jqm2.pl')), String(aveugle.status));

// 4e. La langue choisie est respectée.
spyAvecEtat(null);
await contribute({ code: '0752612000113', ingredients_text: 'Alkalized cocoa.', lang: 'en' });
const enAnglais = calls.find((c) => c.url.includes('product_jqm2.pl'));
check('ingrédients : langue en -> ingredients_text_en', enAnglais && enAnglais.fields.ingredients_text_en === 'Alkalized cocoa.', enAnglais && JSON.stringify(enAnglais.fields));

// --- Résultat ---------------------------------------------------------------
console.log(`\n${pass}/${pass + failures.length} tests Worker au vert`);
if (failures.length) {
  console.log('\nÉCHECS :');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
