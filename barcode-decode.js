// Décodage d'un code-barres depuis un flux vidéo, via ZXing compilé en
// WebAssembly.
//
// POURQUOI CE FICHIER EXISTE : Apple n'implémente pas BarcodeDetector dans
// WebKit, et impose WebKit à TOUS les navigateurs iOS. Aucun iPhone ne peut
// donc scanner nativement. Voir
// docs/superpowers/specs/2026-08-02-scan-iphone-photo-design.md
//
// Il est chargé PARESSEUSEMENT par app.js, au premier appui sur le déclencheur.
// Un Android, qui a BarcodeDetector, n'exécute jamais ce fichier et ne
// télécharge donc jamais le WASM (1,07 Mo, ~438 Ko compressé).
//
// Il ne connaît rien de l'app : ni les écrans, ni Open Food Facts, ni les
// verdicts. Il prend une vidéo, rend une chaîne ou null. La validation du
// code-barres (longueur, checksum GS1) reste dans app.js et sert les DEUX
// chemins, pour qu'il n'existe qu'une seule définition de "code-barres valide".

const ZXING_DIR = new URL('./vendor/zxing/', import.meta.url).href;

// Formats de la distribution alimentaire. Les restreindre accélère le décodage
// et réduit les faux positifs par rapport à "tout essayer".
const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128'];

// Côté long maximal soumis au décodeur. Au-delà, on paie du temps de calcul
// sans gagner en lisibilité : un code-barres net à 1280 px l'est déjà.
const MAX_SIDE = 1280;

let modulePromise = null;

// Charge le module et lui indique où trouver son .wasm. Sans cet override,
// Emscripten le cherche à côté du DOCUMENT et non du module, donc à la
// mauvaise adresse une fois l'app servie depuis un sous-dossier.
function loadZXing() {
  if (!modulePromise) {
    modulePromise = import(`${ZXING_DIR}reader/index.js`).then((mod) => {
      mod.setZXingModuleOverrides({
        locateFile: (path) =>
          (path.endsWith('.wasm') ? `${ZXING_DIR}reader/zxing_reader.wasm` : path),
      });
      return mod;
    });
  }
  return modulePromise;
}

// Précharge le décodeur sans rien décoder. Permet à l'interface d'afficher
// "Préparation du lecteur..." au bon moment plutôt que de laisser le premier
// appui sans réaction visible pendant le téléchargement.
export function preloadDecoder() {
  return loadZXing().then(() => true).catch(() => false);
}

function grabFrame(video, canvas) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tente de lire un code-barres dans le flux vidéo.
 *
 * Prend PLUSIEURS vues successives plutôt qu'une seule : l'utilisateur tient
 * son téléphone d'une main devant un rayon, et l'image unique du moment précis
 * de l'appui est souvent celle où la main a bougé. Trois tentatives coûtent
 * moins d'une demi-seconde et changent nettement le taux de réussite.
 *
 * @returns {Promise<string|null>} le contenu brut du code-barres, ou null.
 *   La validité (longueur, checksum) est vérifiée par l'appelant.
 */
export async function decodeFromVideo(video, attempts = 3, gapMs = 150) {
  const zxing = await loadZXing();
  const canvas = document.createElement('canvas');

  for (let i = 0; i < attempts; i++) {
    const frame = grabFrame(video, canvas);
    if (frame) {
      try {
        const results = await zxing.readBarcodes(frame, {
          formats: FORMATS,
          tryHarder: true,
          maxNumberOfSymbols: 1,
        });
        const hit = results && results.find((r) => r && r.text);
        if (hit) return hit.text;
      } catch (err) {
        // Une vue illisible n'est pas une panne : on tente la suivante.
      }
    }
    if (i < attempts - 1) await wait(gapMs);
  }
  return null;
}
