// Logs de debug silencieux en prod. Passer à true pour diagnostiquer.
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

// Version LISIBLE affichée à l'utilisateur. À incrémenter à chaque livraison
// (v1.18 -> v1.19). Rien à voir avec le cache : celui-ci utilise BUILD.
const APP_VERSION = 'v1.49';
// Numéro de build = cache-busting. Doit correspondre à CACHE_NAME dans sw.js
// et aux ?v=... de index.html, sinon les utilisateurs gardent l'ancienne version.
const BUILD = '1786291361';
document.getElementById('app-version').textContent = APP_VERSION;
console.log(`[APP] ${APP_VERSION} (build ${BUILD})`);

const homeScreen = document.getElementById('home-screen');
const searchScreen = document.getElementById('search-screen');
const scanScreen = document.getElementById('scan-screen');
const resultScreen = document.getElementById('result-screen');

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const resultsList = document.getElementById('results-list');
const backButton = document.getElementById('back-button');

let scannerInitialized = false;
let scanningLoop = null;
let currentStream = null;
let currentVideo = null;
let lastOFFRequestTime = 0;
const OFF_MIN_DELAY_MS = 1000;
let currentSearchController = null; // pour annuler une recherche en cours
let currentRiskyAdditives = [];
let currentAllAdditives = [];
let currentAdditivesCount = 0;
let productHistory = [];
let currentGenericName = ''; // dénomination légale, affichée dans son popup
const MAX_HISTORY = 4;

let RISKY_ADDITIVES = {};
let LIMITED_ADDITIVES = {};


const VERDICT_META = {
  clean: { label: 'Clean', className: 'v-clean' },
  warning: { label: 'À vérifier', className: 'v-warning' },
  misleading: { label: 'Trompeur', className: 'v-misleading' },
  // "Rien à vérifier" = le nom ne promet aucun aliment (57 % des scans).
  // À NE PAS confondre avec "Impossible de vérifier", qui est un échec : là,
  // OFF n'a pas la composition. Ici tout va bien, il n'y avait rien à comparer.
  noclaim: { label: 'Rien à vérifier', className: 'v-noclaim' },
  unknown: { label: 'Impossible de vérifier', className: 'v-unknown' },
  // La liste existe, mais dans une langue hors du dictionnaire. Distinct de
  // "unknown" : proposer une photo ne servirait à rien, la liste est déjà là.
  foreign: { label: 'Langue non prise en charge', className: 'v-unknown' },
};

// Couleurs alignées sur les 3 tokens du design system (var --green/--amber/--red)
// pour rester cohérent avec les autres badges : vert = bon, orange = moyen, rouge = mauvais.
const NUTRISCORE_META = {
  a: { color: '#2F6F4F', label: 'Très favorable' },
  b: { color: '#2F6F4F', label: 'Favorable' },
  c: { color: '#B5792A', label: 'Moyen' },
  d: { color: '#C0392B', label: 'Peu favorable' },
  e: { color: '#C0392B', label: 'Défavorable' },
};

const NOVA_META = {
  1: { color: '#2F6F4F', label: 'Non transformé' },
  2: { color: '#2F6F4F', label: 'Peu transformé' },
  3: { color: '#B5792A', label: 'Transformé' },
  4: { color: '#C0392B', label: 'Ultra-transformé' },
};

const BIO_LABEL_TAGS = ['en:organic', 'en:eu-organic', 'fr:ab-agriculture-biologique'];

async function loadAdditivesDatabase() {
  try {
    const response = await fetch('data/additives.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    RISKY_ADDITIVES = data.risky || {};
    LIMITED_ADDITIVES = data.limited || {};
    dbg('[Additives] Loaded:', Object.keys(RISKY_ADDITIVES).length, 'risky,', Object.keys(LIMITED_ADDITIVES).length, 'limited');
  } catch (err) {
    console.error('[Additives] Failed to load:', err.message);
    loadFallbackAdditives();
  }
}

function loadFallbackAdditives() {
  RISKY_ADDITIVES = {
    'en:e250': { name: 'Nitrite de sodium', reason: 'Carcinogène probable' },
    'en:e251': { name: 'Nitrate de sodium', reason: 'Risque carcinogène' },
    'en:e252': { name: 'Nitrate de potassium', reason: 'Risque carcinogène' },
    'en:e320': { name: 'BHA', reason: 'Perturbateur endocrinien' },
    'en:e321': { name: 'BHT', reason: 'Perturbateur endocrinien' },
    'en:e102': { name: 'Tartrazine', reason: 'Hyperactivité enfants' },
    'en:e110': { name: 'Sunset yellow FCF', reason: 'Hyperactivité enfants' },
    'en:e124': { name: 'Ponceau 4R', reason: 'Hyperactivité enfants' },
    'en:e129': { name: 'Allura red AC', reason: 'Hyperactivité enfants' },
    'en:e171': { name: 'Dioxyde de titane', reason: 'Interdit EU 2022' },
    'en:e951': { name: 'Aspartame', reason: 'Possible carcinogène' }
  };
  LIMITED_ADDITIVES = {};
  dbg('[Additives] Fallback loaded (11 codes)');
}

// Base de données des additifs courants avec nom et rôle
const ADDITIVES_DATABASE = {
  'en:e101': { name: 'Riboflavine', role: 'Colorant' },
  'en:e102': { name: 'Tartrazine', role: 'Colorant jaune' },
  'en:e104': { name: 'Jaune de quinoléine', role: 'Colorant' },
  'en:e110': { name: 'Jaune orangé S', role: 'Colorant' },
  'en:e120': { name: 'Cochenille', role: 'Colorant rouge' },
  'en:e124': { name: 'Rouge cochenille A', role: 'Colorant rouge' },
  'en:e129': { name: 'Rouge allura AC', role: 'Colorant rouge' },
  'en:e131': { name: 'Bleu patenté V', role: 'Colorant bleu' },
  'en:e133': { name: 'Bleu brillant FCF', role: 'Colorant bleu' },
  'en:e150a': { name: 'Caramel classe I', role: 'Colorant' },
  'en:e150b': { name: 'Caramel classe II', role: 'Colorant' },
  'en:e150c': { name: 'Caramel classe III', role: 'Colorant' },
  'en:e150d': { name: 'Caramel classe IV', role: 'Colorant' },
  'en:e160a': { name: 'Carotènes', role: 'Colorant orange' },
  'en:e160c': { name: 'Lycopène', role: 'Colorant rouge' },
  'en:e162': { name: 'Anthocyanes', role: 'Colorant rouge/bleu' },
  'en:e171': { name: 'Dioxyde de titane', role: 'Colorant blanc' },
  'en:e200': { name: 'Acide sorbique', role: 'Conservateur' },
  'en:e202': { name: 'Sorbate de potassium', role: 'Conservateur' },
  'en:e210': { name: 'Acide benzoïque', role: 'Conservateur' },
  'en:e211': { name: 'Benzoate de sodium', role: 'Conservateur' },
  'en:e220': { name: 'Dioxyde de soufre', role: 'Conservateur' },
  'en:e250': { name: 'Nitrite de sodium', role: 'Conservateur' },
  'en:e251': { name: 'Nitrate de sodium', role: 'Conservateur' },
  'en:e252': { name: 'Nitrate de potassium', role: 'Conservateur' },
  'en:e301': { name: 'Ascorbate de sodium', role: 'Antioxydant' },
  'en:e306': { name: 'Tocophérols', role: 'Antioxydant' },
  'en:e320': { name: 'BHA', role: 'Antioxydant' },
  'en:e321': { name: 'BHT', role: 'Antioxydant' },
  'en:e407': { name: 'Carraghénane', role: 'Épaississant' },
  'en:e410': { name: 'Gomme de caroube', role: 'Épaississant / Stabilisant' },
  'en:e412': { name: 'Gomme de guar', role: 'Épaississant' },
  'en:e413': { name: 'Gomme d\'acacia', role: 'Épaississant' },
  'en:e414': { name: 'Gomme xanthane', role: 'Épaississant' },
  'en:e415': { name: 'Gomme de xanthane', role: 'Épaississant' },
  'en:e428': { name: 'Gélatine', role: 'Épaississant d\'origine animale' },
  'en:e433': { name: 'Polysorbate 80', role: 'Émulsifiant' },
  'en:e440': { name: 'Pectine', role: 'Épaississant' },
  'en:e466': { name: 'Carboxyméthylcellulose', role: 'Épaississant / Gélifiant' },
  'en:e471': { name: 'Mono- et diglycérides d\'acides gras', role: 'Émulsifiant' },
  'en:e500': { name: 'Carbonate de sodium', role: 'Régulateur d\'acidité' },
  'en:e501': { name: 'Carbonate de potassium', role: 'Régulateur d\'acidité' },
  'en:e621': { name: 'Glutamate monosodique', role: 'Exhausteur de goût' },
  'en:e950': { name: 'Acésulfame K', role: 'Édulcorant' },
  'en:e951': { name: 'Aspartame', role: 'Édulcorant' },
  'en:e952': { name: 'Cyclamate', role: 'Édulcorant' },
  'en:e955': { name: 'Sucralose', role: 'Édulcorant' },
  // Colorants / minéraux
  'en:e100': { name: 'Curcumine', role: 'Colorant jaune' },
  'en:e160b': { name: 'Rocou (annatto)', role: 'Colorant orange' },
  'en:e170': { name: 'Carbonate de calcium', role: 'Régulateur d\'acidité / Colorant' },
  // Acides / régulateurs d'acidité
  'en:e260': { name: 'Acide acétique', role: 'Régulateur d\'acidité' },
  'en:e270': { name: 'Acide lactique', role: 'Régulateur d\'acidité' },
  'en:e296': { name: 'Acide malique', role: 'Régulateur d\'acidité' },
  'en:e300': { name: 'Acide ascorbique (Vitamine C)', role: 'Antioxydant' },
  'en:e322': { name: 'Lécithines', role: 'Émulsifiant' },
  'en:e325': { name: 'Lactate de sodium', role: 'Régulateur d\'acidité' },
  'en:e330': { name: 'Acide citrique', role: 'Régulateur d\'acidité' },
  'en:e331': { name: 'Citrates de sodium', role: 'Régulateur d\'acidité' },
  'en:e332': { name: 'Citrates de potassium', role: 'Régulateur d\'acidité' },
  'en:e333': { name: 'Citrates de calcium', role: 'Régulateur d\'acidité' },
  'en:e336': { name: 'Tartrates de potassium', role: 'Régulateur d\'acidité' },
  'en:e338': { name: 'Acide phosphorique', role: 'Régulateur d\'acidité' },
  'en:e340': { name: 'Phosphates de potassium', role: 'Régulateur d\'acidité' },
  'en:e341': { name: 'Phosphates de calcium', role: 'Anti-agglomérant / Poudre à lever' },
  'en:e392': { name: 'Extraits de romarin', role: 'Antioxydant' },
  // Épaississants / gélifiants / stabilisants
  'en:e401': { name: 'Alginate de sodium', role: 'Épaississant' },
  'en:e406': { name: 'Agar-agar', role: 'Gélifiant' },
  'en:e418': { name: 'Gomme gellane', role: 'Épaississant / Stabilisant' },
  'en:e420': { name: 'Sorbitol', role: 'Édulcorant / Humectant' },
  'en:e422': { name: 'Glycérol', role: 'Humectant' },
  'en:e450': { name: 'Diphosphates', role: 'Poudre à lever / Stabilisant' },
  'en:e451': { name: 'Triphosphates', role: 'Stabilisant' },
  'en:e460': { name: 'Cellulose', role: 'Épaississant / Anti-agglomérant' },
  'en:e461': { name: 'Méthylcellulose', role: 'Épaississant' },
  'en:e464': { name: 'Hydroxypropylméthylcellulose', role: 'Épaississant' },
  'en:e470': { name: 'Sels d\'acides gras', role: 'Émulsifiant / Anti-agglomérant' },
  'en:e472e': { name: 'Esters d\'acides gras', role: 'Émulsifiant' },
  'en:e476': { name: 'Polyricinoléate de polyglycérol', role: 'Émulsifiant' },
  'en:e481': { name: 'Stéaroyl-2-lactylate de sodium', role: 'Émulsifiant' },
  // Poudres à lever / sels minéraux
  'en:e500': { name: 'Carbonates de sodium', role: 'Poudre à lever / Régulateur d\'acidité' },
  'en:e503': { name: 'Carbonates d\'ammonium', role: 'Poudre à lever' },
  'en:e504': { name: 'Carbonates de magnésium', role: 'Anti-agglomérant' },
  'en:e509': { name: 'Chlorure de calcium', role: 'Affermissant' },
  'en:e575': { name: 'Glucono-delta-lactone', role: 'Régulateur d\'acidité' },
  // Exhausteurs de goût
  'en:e627': { name: 'Guanylate disodique', role: 'Exhausteur de goût' },
  'en:e631': { name: 'Inosinate disodique', role: 'Exhausteur de goût' },
  // Enzymes
  'en:e1100': { name: 'Amylase', role: 'Enzyme' },
  'en:e1103': { name: 'Invertase', role: 'Enzyme' },
  'en:e1105': { name: 'Lysozyme', role: 'Enzyme / Conservateur' },
  // Amidons modifiés / divers
  'en:e1400': { name: 'Dextrines', role: 'Épaississant' },
  'en:e1404': { name: 'Amidon oxydé', role: 'Épaississant' },
  'en:e1412': { name: 'Phosphate de diamidon', role: 'Épaississant' },
  'en:e1414': { name: 'Phosphate de diamidon acétylé', role: 'Épaississant' },
  'en:e1420': { name: 'Amidon acétylé', role: 'Épaississant' },
  'en:e1442': { name: 'Phosphate de diamidon hydroxypropylé', role: 'Épaississant' },
  'en:e1450': { name: 'Octényle succinate d\'amidon sodique', role: 'Émulsifiant / Épaississant' },
};

function findFlaggedAdditives(additivesTags) {
  if (!Array.isArray(additivesTags)) return { risky: [], limited: [] };
  const risky = additivesTags
    .filter(tag => RISKY_ADDITIVES[tag])
    .map(tag => ({
      code: tag.replace('en:', '').toUpperCase(),
      name: RISKY_ADDITIVES[tag].name,
      reason: RISKY_ADDITIVES[tag].reason
    }));
  const limited = additivesTags
    .filter(tag => LIMITED_ADDITIVES[tag])
    .map(tag => ({
      code: tag.replace('en:', '').toUpperCase(),
      name: LIMITED_ADDITIVES[tag].name,
      reason: LIMITED_ADDITIVES[tag].reason
    }));
  return { risky, limited };
}

// La couleur reflète le niveau le PLUS dangereux des additifs présents
// (rouge = risqué, orange = à limiter, vert = ok), pas le nombre.
// worstCategory: 'risky' | 'limited' | 'ok' | undefined (inconnu).
function additivesMeta(count, worstCategory) {
  if (count === undefined || count === null) return null;
  if (count === 0) return { color: '#2F6F4F', icon: '0', label: 'Aucun' };
  const colorByCat = { risky: '#C0392B', limited: '#B5792A', ok: '#2F6F4F' };
  // Additifs présents mais catégorie inconnue -> orange par prudence.
  const color = colorByCat[worstCategory] || '#B5792A';
  return { color, icon: String(count), label: `${count} additif${count > 1 ? 's' : ''}` };
}

function bioMeta(labelsTags, ingredientsText) {
  // 1) Label bio officiel = certifié
  const certified = Array.isArray(labelsTags) && labelsTags.some((tag) => BIO_LABEL_TAGS.includes(tag));
  if (certified) return { color: '#2F6F4F', icon: '✓', label: 'Certifié' };

  // 2) Sinon, ingrédients marqués "organic"/"biologique" (souvent OFF n'a pas le label)
  const norm = (ingredientsText || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/\borganic\b|\bbiologique\b|agriculture biologique/.test(norm)) {
    return { color: '#2F6F4F', icon: '✓', label: 'Ingrédients bio' };
  }
  return null;
}

// Code de base d'un additif : retire le suffixe de sous-forme en chiffres
// romains ('en:e322i' -> 'en:e322', 'en:e500ii' -> 'en:e500'). Une sous-forme
// désigne le MÊME additif que sa base (les lettres type e150a/e472e sont, elles,
// de vraies variantes distinctes et ne sont pas touchées).
function additiveBaseCode(tag) {
  return tag.replace(/(?:iii|ii|iv|vii|vi|v|i)$/, '');
}

// Recherche l'info d'un additif, avec repli sur le code de base si sous-forme.
function additiveInfo(tag) {
  if (ADDITIVES_DATABASE[tag]) return ADDITIVES_DATABASE[tag];
  const base = additiveBaseCode(tag);
  if (base !== tag && ADDITIVES_DATABASE[base]) return ADDITIVES_DATABASE[base];
  return {};
}

function showScreen(screen) {
  homeScreen.classList.toggle('hidden', screen !== 'home');
  searchScreen.classList.toggle('hidden', screen !== 'search');
  scanScreen.classList.toggle('hidden', screen !== 'scan');
  resultScreen.classList.toggle('hidden', screen !== 'result');
  backButton.classList.toggle('hidden', screen === 'home');
  if (screen === 'home' || screen === 'search') {
    searchInput.value = '';
    resultsList.innerHTML = '';
    searchStatus.textContent = '';
  }
  // Le code-barres n'a de sens que sur la fiche produit
  if (screen !== 'result') {
    const codeEl = document.getElementById('app-product-code');
    if (codeEl) codeEl.textContent = '';
  }
  if (screen === 'scan') startScanner();
  else stopScanner();
}

// Chiffre de contrôle GS1 (EAN-13, EAN-8, UPC-A) : depuis la droite, on pondère
// les chiffres (hors clé) par 3,1,3,1... ; clé = (10 - somme%10)%10.
function validateGS1Checksum(code) {
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

// Validation STRICTE d'un code-barres : longueur standard (EAN-8/UPC-A/EAN-13)
// ET chiffre de contrôle GS1 valide. Rejette le bruit qu'un décodeur peut
// renvoyer sur une image sans vrai code-barres.
// Au niveau du FICHIER, pas dans startScanner : les deux chemins de lecture
// (BarcodeDetector sur Android, ZXing-WASM sur iPhone) doivent appliquer
// exactement les mêmes règles, sinon "code-barres valide" finit par vouloir
// dire deux choses différentes.
function isValidBarcode(code) {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13].includes(code.length)) return false;
  return validateGS1Checksum(code);
}

// Ouvre la caméra arrière et branche le flux dans le cadre de l'écran scan.
// Partagée par les deux chemins : il n'y a qu'un seul propriétaire de la caméra.
// Renvoie l'élément <video> prêt, ou null si l'accès a échoué (le message
// d'erreur est alors déjà affiché).
async function openCameraInto(qrReader, scanStatus) {
  // Créer l'élément vidéo ET L'AJOUTER AU DOM pour afficher le flux caméra.
  const videoElement = document.createElement('video');
  videoElement.setAttribute('playsinline', 'true'); // lecture inline mobile
  videoElement.muted = true;
  videoElement.style.width = '100%';
  videoElement.style.height = '100%';
  videoElement.style.objectFit = 'cover';
  qrReader.innerHTML = '';
  qrReader.appendChild(videoElement);
  currentVideo = videoElement;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } catch (err) {
    console.error('[Scanner] Erreur caméra:', { name: err.name, message: err.message });
    scanStatus.textContent = cameraErrorMessage(err);
    return null;
  }

  currentStream = stream;
  videoElement.srcObject = stream;
  await videoElement.play();
  dbg('[Scanner] ✅ Caméra démarrée');
  return videoElement;
}

async function startScanner() {
  if (scannerInitialized) return;
  const scanStatus = document.getElementById('scan-status');
  try {
    let lastDetectionTime = 0;
    const DEBOUNCE_DELAY = 1200; // 1.2 secondes - équilibre vitesse vs faux positifs

    dbg('[Scanner] Initializing Barcode Detection API...');

    const qrReader = document.getElementById('qr-reader');

    // BarcodeDetector est natif sur Chrome Android. Absent sur iOS : Apple ne
    // l'implémente pas dans WebKit, et Apple impose WebKit à TOUS les navigateurs
    // iOS - installer Chrome ou Firefox n'y change donc rien. L'ancien message
    // conseillait "Chrome sur Android", impossible à suivre depuis un iPhone.
    if (!('BarcodeDetector' in window)) {
      console.warn('[Scanner] BarcodeDetector absent - bascule sur le décodeur WASM');
      await startShutterScanner(qrReader, scanStatus);
      return;
    }

    dbg('[Scanner] Using native Barcode Detection API');

    // IMPORTANT: l'API BarcodeDetector attend des noms de format en CHAÎNE
    // ('ean_13', ...), PAS un enum window.BarcodeFormat (qui n'existe pas).
    // Un tableau formats vide fait planter le constructeur -> on l'évite.
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    let supported = [];
    try {
      supported = await window.BarcodeDetector.getSupportedFormats();
    } catch (e) {
      console.warn('[Scanner] getSupportedFormats a échoué:', e);
    }
    const formats = wanted.filter((f) => supported.includes(f));
    dbg('[Scanner] Formats supportés:', supported, '| utilisés:', formats);

    // Si aucun format ne matche, on construit sans option (détecte tout).
    const detector = formats.length > 0
      ? new window.BarcodeDetector({ formats })
      : new window.BarcodeDetector();

    const videoElement = await openCameraInto(qrReader, scanStatus);
    if (!videoElement) return;
    scanStatus.textContent = '✓ Prêt : pointe vers un code-barres';
    scannerInitialized = true;

    // Anti-faux-positifs : exiger 2 lectures identiques d'affilée d'un code
    // dont le chiffre de contrôle est valide, avant d'accepter.
    let lastCandidate = null;
    let candidateCount = 0;
    const REQUIRED_CONSECUTIVE = 2;

    scanningLoop = setInterval(async () => {
      try {
        const barcodes = await detector.detect(videoElement);
        if (barcodes.length === 0) {
          lastCandidate = null;
          candidateCount = 0;
          return;
        }

        const code = barcodes[0].rawValue;

        if (!isValidBarcode(code)) {
          dbg('[Scanner] Rejected: format/checksum invalide', code);
          lastCandidate = null;
          candidateCount = 0;
          return;
        }

        // Stabilité : même code lu plusieurs frames de suite
        if (code === lastCandidate) {
          candidateCount += 1;
        } else {
          lastCandidate = code;
          candidateCount = 1;
        }
        if (candidateCount < REQUIRED_CONSECUTIVE) {
          return;
        }

        const now = Date.now();
        if (now - lastDetectionTime < DEBOUNCE_DELAY) {
          dbg('[Scanner] Rejected: debounce');
          return;
        }

        lastDetectionTime = now;
        dbg('[Scanner] ✅ ACCEPTED:', code);
        handleQrScan(code);
      } catch (err) {
        // Ignorer silencieusement les erreurs de décodage par frame
      }
    }, 100);
  } catch (err) {
    console.error('[Scanner] Error:', err);
    scanStatus.textContent = `Erreur caméra: ${err.name || err.message || 'inconnue'}`;
  }
}

// Chemin iPhone / iPad : pas de BarcodeDetector, donc pas de lecture continue.
// L'aperçu caméra, lui, fonctionne parfaitement sous WebKit - c'est le DÉCODAGE
// qui coûte cher. On ne le déclenche donc qu'à l'appui, sur trois vues
// successives. Voir la spec 2026-08-02-scan-iphone-photo-design.md
async function startShutterScanner(qrReader, scanStatus) {
  const hintEl = document.getElementById('scan-hint');
  if (hintEl) hintEl.textContent = 'Vise le code-barres, puis appuie sur le bouton.';

  // Ces éléments ont été AJOUTÉS au HTML : sur un appareil qui a encore
  // l'ancien index.html en cache, ils n'existent pas. Sans repli, la lecture
  // échouerait sur un TypeError au lieu d'un message compréhensible.
  const searchFallback = document.getElementById('shutter-search');
  const showSearchFallback = () => { if (searchFallback) searchFallback.classList.remove('hidden'); };

  const videoElement = await openCameraInto(qrReader, scanStatus);
  if (!videoElement) {
    // Sans aperçu, le cadre vide donne l'impression d'une panne : on le masque.
    // Et on cite les messageries, car la plupart des utilisateurs arrivent par
    // un lien WhatsApp, Messenger ou Signal, dont les navigateurs intégrés
    // refusent parfois la caméra là où Safari l'accorde.
    qrReader.classList.add('hidden');
    scanStatus.textContent += " Si tu as ouvert l'app depuis un lien WhatsApp, Messenger ou Signal, essaie plutôt de l'ouvrir dans Safari.";
    showSearchFallback();
    return;
  }

  scannerInitialized = true;
  scanStatus.textContent = '✓ Vise le code-barres';

  const btn = document.getElementById('shutter-button');
  if (!btn) {
    // Ancien index.html encore en cache : on le dit, plutot que de planter.
    scanStatus.textContent = "Recharge l'app pour activer la lecture par photo (mise a jour en cours).";
    showSearchFallback();
    return;
  }
  btn.classList.remove('hidden');
  btn.disabled = false;

  let failures = 0;
  let decoder = null;

  btn.onclick = async () => {
    btn.disabled = true;
    // Le tout premier appui télécharge le WASM (~438 Ko compressés). Sans cet
    // état, l'appui paraît sans effet et l'utilisateur appuie plusieurs fois.
    scanStatus.textContent = decoder ? 'Lecture...' : 'Préparation du lecteur...';
    try {
      if (!decoder) decoder = await import(`./barcode-decode.js?v=${BUILD}`);
      scanStatus.textContent = 'Lecture...';
      const raw = await decoder.decodeFromVideo(videoElement);
      // Mêmes règles que le chemin Android : isValidBarcode est partagée.
      if (raw && isValidBarcode(raw)) {
        dbg('[Scanner] ✅ ACCEPTED (photo):', raw);
        handleQrScan(raw);
        return;
      }
      failures += 1;
      scanStatus.textContent = failures === 1
        ? 'Code-barres illisible. Rapproche-toi et évite les reflets.'
        : 'Toujours illisible. Pose le produit à plat et cadre le code-barres en entier.';
      showSearchFallback();
    } catch (err) {
      console.error('[Scanner] Décodeur indisponible:', err);
      scanStatus.textContent = "Le lecteur n'a pas pu se charger. Vérifie ta connexion et réessaie.";
      showSearchFallback();
    } finally {
      btn.disabled = false;
    }
  };
}

// Message d'erreur caméra clair selon le type d'échec getUserMedia.
function cameraErrorMessage(err) {
  switch (err.name) {
    case 'NotAllowedError':
      return 'Permissions caméra refusées. Autorise la caméra dans les réglages du site.';
    case 'NotFoundError':
      return 'Aucune caméra trouvée sur l\'appareil.';
    case 'NotReadableError':
      return 'La caméra est déjà utilisée par une autre app. Ferme-la et réessaie.';
    case 'SecurityError':
      return 'Contexte non sécurisé. L\'app doit être en HTTPS.';
    case 'OverconstrainedError':
      return 'Caméra arrière indisponible. Réessaie.';
    default:
      return `Erreur caméra: ${err.name || err.message || 'inconnue'}`;
  }
}

// Idempotent : nettoie tout ce qui existe (boucle, flux caméra, élément vidéo).
function stopScanner() {
  try {
    if (scanningLoop) {
      clearInterval(scanningLoop);
      scanningLoop = null;
    }
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    if (currentVideo) {
      currentVideo.srcObject = null;
      currentVideo.remove();
      currentVideo = null;
    }
    // Chemin iPhone : le déclencheur et le repli n'ont plus lieu d'être une
    // fois la caméra coupée, et le cadre doit redevenir visible pour un
    // prochain passage sur l'écran scan.
    const shutter = document.getElementById('shutter-button');
    if (shutter) { shutter.classList.add('hidden'); shutter.onclick = null; }
    const shutterSearch = document.getElementById('shutter-search');
    if (shutterSearch) shutterSearch.classList.add('hidden');
    const reader = document.getElementById('qr-reader');
    if (reader) reader.classList.remove('hidden');
    scannerInitialized = false;
    dbg('[Scanner] ✅ Stopped');
  } catch (err) {
    console.error('[Scanner] Stop error:', err);
  }
}

async function handleQrScan(code) {
  if (!code) return;
  stopScanner();
  showScreen('result');
  showResultLoading();

  let lastError = new Error('product-not-found');
  let product = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      product = await fetchProduct(code);
      if (product) break;
      lastError = new Error('product-not-found');
    } catch (err) {
      lastError = err; // erreur réseau/timeout, on réessaie
    }
    if (attempt < 2) {
      await wait(5000);
    }
  }

  // L'affichage se fait HORS du try réseau : sinon un bug de rendu déclenchait
  // 3 tentatives, 10 s d'attente, et finissait par accuser la connexion.
  if (product) {
    showProduct(product);
    return;
  }

  const notFound = lastError.message === 'product-not-found';
  showResultError(
    notFound
      ? 'Introuvable dans Open Food Facts. Rappel : cette app ne couvre que les produits alimentaires emballés (pas les cosmétiques, livres, etc.).'
      : fetchErrorMessage(lastError),
    notFound ? code : null,
    notFound ? 'Produit non trouvé' : 'Connexion impossible'
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOFF(url, options) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastOFFRequestTime;
  if (timeSinceLastRequest < OFF_MIN_DELAY_MS) {
    await wait(OFF_MIN_DELAY_MS - timeSinceLastRequest);
  }
  lastOFFRequestTime = Date.now();

  return fetch(url, options);
}

// fetch OFF avec un timeout par tentative + annulation externe optionnelle.
// Évite qu'une requête reste bloquée indéfiniment quand OFF est lent/KO.
function fetchOFFWithTimeout(url, ms, externalSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Délai dépassé', 'TimeoutError')), ms);
  const onAbort = () => ctrl.abort();
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  return fetchOFF(url, { signal: ctrl.signal }).finally(() => {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
  });
}

// Message d'erreur clair selon le type d'échec d'un fetch produit OFF.
function fetchErrorMessage(err) {
  if (err.name === 'AbortError') return 'Open Food Facts ne répond pas assez vite. Réessaie dans quelques secondes.';
  if (err.message === 'off-error-5xx') return 'Open Food Facts est en maintenance. Réessaie dans quelques minutes.';
  if (err.message === 'off-rate-limit') return 'Trop de requêtes. Attends quelques secondes et réessaie.';
  if (err.message === 'product-not-found') return 'Introuvable dans Open Food Facts. Cette app ne couvre que les produits alimentaires emballés.';
  return 'Erreur réseau - réessaie.';
}

// Message de recherche : attribue clairement les pannes à Open Food Facts
// (pas à l'app) et oriente vers le scan, qui utilise un service fiable et séparé.
function searchErrorMessage(err) {
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message === 'off-search-down') {
    return 'La recherche Open Food Facts est momentanément indisponible (pas l\'app). Réessaie, ou scanne le code-barres, c\'est plus fiable.';
  }
  if (err.message === 'off-rate-limit') {
    return 'Trop de recherches d\'un coup. Attends quelques secondes et réessaie.';
  }
  return 'Problème de connexion. Vérifie ton réseau et réessaie.';
}

// Langues lisibles par l'utilisateur. La recherche mondiale d'OFF renvoie des
// produits du monde entier (ingrédients en arabe, japonais...) : on garde ceux
// lisibles en français ou anglais. Filtre côté client (le CGI ne sait pas faire
// "fr OU en" en une requête, et son endpoint de recherche est instable).
const READABLE_LANGS = ['fr', 'en'];

// Scripts non lisibles pour un utilisateur fr/en : arabe, hébreu, cyrillique,
// grec, CJK (chinois/japonais/coréen), thaï, devanagari. Un nom qui en contient
// signale un produit non pertinent (ex. yaourts maghrébins avec nom en arabe).
const FOREIGN_SCRIPT = /[֐-׿؀-ۿͰ-ϿЀ-ӿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]/;

function isReadableProduct(p) {
  if (FOREIGN_SCRIPT.test(p.product_name || '')) return false;
  if (READABLE_LANGS.includes(p.lang)) return true;
  const tags = p.languages_tags || [];
  return tags.includes('en:french') || tags.includes('en:english');
}

// Priorité de pays : on remonte les produits vendus au Canada (pays de
// l'utilisateur), puis en France, en tête des résultats. Ne crée pas de données,
// réordonne juste ce qu'OFF renvoie.
const COUNTRY_PRIORITY = [
  { tag: 'en:canada', score: 2 },
  { tag: 'en:france', score: 1 },
];

function countryScore(p) {
  const tags = p.countries_tags || [];
  let best = 0;
  for (const { tag, score } of COUNTRY_PRIORITY) {
    if (tags.includes(tag) && score > best) best = score;
  }
  return best;
}

// Proxy de recherche (Cloudflare Worker) : appelle la nouvelle API OFF fiable
// côté serveur, met en cache, et renvoie du JSON avec CORS. Bien plus fiable que
// le vieux endpoint CGI. Voir cloudflare-worker/search-proxy.js.
const SEARCH_PROXY = 'https://etiquette-vraie-search.jfrxdi0zz.workers.dev/search';

async function searchProducts(term, onRetry, signal) {
  // page_size élargi : on récupère plus de candidats puis on filtre/trie.
  const url = `${SEARCH_PROXY}?q=${encodeURIComponent(term)}&page_size=40`;
  const SEARCH_TIMEOUT_MS = 7000;
  const runFetch = async () => {
    const response = await fetchOFFWithTimeout(url, SEARCH_TIMEOUT_MS, signal);
    // Erreurs typées pour distinguer "OFF en panne" d'un vrai "aucun résultat".
    if (response.status >= 500) throw new Error('off-search-down');
    if (response.status === 429) throw new Error('off-rate-limit');
    if (!response.ok) throw new Error('network');
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('off-search-down'); // réponse non-JSON = souci
    }
    if (data.error) throw new Error('off-search-down'); // le proxy signale une panne OFF
    return (data.products || []).filter((p) => p.product_name);
  };

  let products;
  try {
    products = await runFetch();
  } catch (err) {
    if (signal && signal.aborted) throw err; // recherche annulée/remplacée : ne pas réessayer
    if (onRetry) onRetry();
    await wait(1500);
    products = await runFetch();
  }

  // Garder les produits lisibles (fr/en). Repli : si aucun, tout garder.
  const readable = products.filter(isReadableProduct);
  const list = readable.length > 0 ? readable : products;

  // Tri stable : Canada puis France en tête, reste dans l'ordre de pertinence OFF.
  const sorted = [...list].sort((a, b) => countryScore(b) - countryScore(a));
  return sorted.slice(0, 15);
}

// Champs demandés à OFF - partagés par le scan ET la recherche pour une UX cohérente.
// image_ingredients_url : permet de distinguer "personne n'a envoyé de photo"
// de "photo envoyée, OFF ne l'a pas encore validée". Sans ce champ, plusieurs
// utilisateurs photographieraient le même produit en série - chaque envoi
// REMPLACE l'image de référence, donc une photo floue peut en dégrader une nette.
const PRODUCT_FIELDS = 'product_name,generic_name,ingredients_text,ingredients_text_fr,ingredients_text_en,lang,brands,last_modified_t,image_front_small_url,image_ingredients_url,ingredients,code,nutriscore_grade,nova_group,additives_n,additives_tags,labels_tags,categories_tags';

async function fetchProduct(code) {
  // API v2 et NON v0 : la v0 APLATIT l'arbre des ingrédients. Un sous-ingrédient
  // y remonte au premier niveau avec son pourcentage RELATIF À SON PARENT, qu'on
  // ne peut plus distinguer d'un pourcentage absolu. Sur les biscuits Nutella,
  // la v0 fait afficher "noisette 13 %" alors que le biscuit en contient 1,5 % :
  // les 13 % sont ceux de la pâte à tartiner. La v2 conserve l'imbrication.
  // Réponse identique par ailleurs : mêmes champs, même { status, product },
  // même status:0 sur un code inconnu.
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${PRODUCT_FIELDS}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchOFF(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status >= 500) throw new Error('off-error-5xx');
      if (response.status === 429) throw new Error('off-rate-limit');
      throw new Error('api-error');
    }
    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;
    return data.product;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function findAlternative(product) {
  const categories = product.categories_tags;
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const category = categories[categories.length - 1].replace(/^\w+:/, '');
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&sort_by=unique_scans_n`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetchOFF(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const candidates = data.products || [];
    for (const candidate of candidates) {
      if (!candidate.code || candidate.code === product.code) continue;
      if (!candidate.ingredients_text || !candidate.product_name) continue;
      const candidateVerdict = detectVerdict(candidate.product_name, candidate.ingredients_text);
      // "noclaim" est aussi une alternative valable : son nom ne promet aucun
      // aliment, donc il ne peut pas tromper. L'exclure amputait le vivier de
      // 57 % des fiches (mesure du 2026-08-07) - la plupart des produits.
      if (candidateVerdict.verdict !== 'clean' && candidateVerdict.verdict !== 'noclaim') continue;
      const flagged = findFlaggedAdditives(candidate.additives_tags);
      if (flagged.risky.length > 0) continue;
      return candidate;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function renderResults(products) {
  resultsList.innerHTML = '';
  if (products.length === 0) {
    searchStatus.textContent = 'Aucun produit à ce nom. Vérifie l\'orthographe, essaie une marque, ou scanne le code-barres.';
    return;
  }
  searchStatus.textContent = '';
  products.forEach((product) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.innerHTML = `
      <img class="result-thumb" src="${product.image_front_small_url || ''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="result-text">
        <div class="result-name">${product.product_name}</div>
        <div class="result-brand">${product.brands || ''}</div>
      </div>
    `;
    const open = () => selectProduct(product.code);
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    resultsList.appendChild(li);
  });
}

async function selectProduct(code) {
  showScreen('result');
  showResultLoading();
  let productToShow;
  try {
    const product = await fetchProduct(code);
    if (!product) {
      showResultError(fetchErrorMessage(new Error('product-not-found')), code, 'Produit non trouvé');
      return;
    }
    productToShow = product;
  } catch (err) {
    dbg('[APP] selectProduct error:', err.message);
    showResultError(fetchErrorMessage(err), null, 'Connexion impossible');
    return;
  }
  showProduct(productToShow); // hors du try : voir showProduct
}

// Point de passage unique pour afficher une fiche. L'affichage est isolé du
// réseau : un plantage de rendu est un bug de l'app, pas une panne de connexion.
// Les confondre masquait le vrai défaut derrière un message faux.
function showProduct(product) {
  try {
    renderResult(product);
  } catch (err) {
    console.error('[Result] Affichage impossible pour', product && product.code, err);
    showResultError(
      "L'app n'a pas réussi à afficher cette fiche. C'est un bug de notre côté, pas ta connexion.",
      null,
      'Affichage impossible'
    );
  }
}

function freshnessText(lastModifiedT) {
  if (!lastModifiedT) return 'Date de dernière vérification inconnue.';
  const modifiedDate = new Date(lastModifiedT * 1000);
  const days = Math.floor((Date.now() - modifiedDate.getTime()) / 86400000);
  let ago;
  if (days < 1) ago = "aujourd'hui";
  else if (days < 30) ago = `il y a ${days} jour${days > 1 ? 's' : ''}`;
  else if (days < 365) ago = `il y a ${Math.round(days / 30)} mois`;
  else ago = `il y a ${Math.round(days / 365)} an${days >= 730 ? 's' : ''}`;
  return `Donnée vérifiée ${ago}. La recette a pu changer depuis.`;
}

function renderScoreTile(iconId, valueId, meta, fallbackLabel) {
  const iconEl = document.getElementById(iconId);
  const valueEl = document.getElementById(valueId);
  if (meta) {
    iconEl.style.background = meta.color;
    iconEl.style.color = '#fff'; // texte blanc sur badge coloré (évite un gris résiduel)
    iconEl.textContent = meta.icon;
    valueEl.textContent = meta.label;
  } else {
    iconEl.style.background = 'var(--tile-empty)';
    iconEl.style.color = 'var(--tile-empty-ink)';
    iconEl.textContent = '-';
    valueEl.textContent = fallbackLabel;
  }
}

// Coupe la PROSE que les fabricants collent après leur liste : "*Ingrédient
// issu de l'agriculture biologique.", "Origine : ...", "Peut contenir...".
// Elle s'agglutine au dernier ingrédient et se fait surligner : sur "Soupe de
// poireaux", la phrase d'origine contient le mot "poireaux", donc c'est la
// ligne "poivre blanc" qui s'allumait.
//
// Trois points ne terminent PAS une phrase, et les trois se rencontrent :
//   - "0.5%"                  -> décimale anglaise (le point suit un chiffre)
//   - "(S. thermophilus)"     -> initiale d'un nom d'espèce, dans un ferment
//   - tout point entre parenthèses, qui appartient à une précision technique
function couperProse(item) {
  let profondeur = 0;
  for (let i = 0; i < item.length; i++) {
    const c = item[i];
    if (c === '(' || c === '[') profondeur++;
    else if (c === ')' || c === ']') profondeur = Math.max(0, profondeur - 1);
    if (c !== '.' || profondeur > 0) continue;
    const apres = item[i + 1];
    if (apres !== undefined && !/\s/.test(apres)) continue; // 0.5%
    const avant = item[i - 1] || '';
    const avantAvant = item[i - 2] || '';
    const initiale = /[A-ZÀ-Þ]/.test(avant) && !/[A-Za-zÀ-ÿ]/.test(avantAvant);
    if (initiale) continue;                                  // S. thermophilus
    return item.slice(0, i).trim();
  }
  return item.trim();
}

// Extrait centré sur l'ingrédient signalé (évite d'afficher une liste entière
// quand elle fait plusieurs dizaines d'ingrédients).
function buildIngredientExcerpt(ingredientsText, detail) {
  // MÊME découpage que le moteur (rules.js) : c'est ce qui garantit que la
  // ligne surlignée est celle qu'il a repérée. Découper ici sur toutes les
  // virgules faisait disparaître les morceaux de décimales ("4%" de "59,4%")
  // et décalait toutes les lignes suivantes.
  const items = splitIngredientList(ingredientsText || '')
    .map(couperProse)
    // Retirer le pourcentage, décimales comprises : "59,4 %" comme "0.5%".
    .map((s) => s.replace(/^\d+(?:[.,]\d+)?\s*%\s*/, '').replace(/\s*\d+(?:[.,]\d+)?\s*%\s*$/, '').trim())
    .filter(Boolean);
  if (items.length === 0) return { rows: [], caption: '' };

  // Mots à mettre en évidence, venus de detail.matched ("boeuf, aubergines").
  // ⚠️ Ne PAS abandonner quand detail.index est absent : il ne l'est que sur
  // les verdicts "l'aliment est confirmé". Tous les verdicts "il manque
  // quelque chose" n'ont pas d'index, et l'ancienne sortie anticipée éteignait
  // alors TOUT le surlignage - y compris celui des aliments bien présents.
  // Sur "Moelleux goût choco-noisette", le cacao était reconnu mais sa ligne
  // restait éteinte.
  const matchedIngredients = detail && detail.matched
    ? detail.matched.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const indexRepere = detail && typeof detail.index === 'number' ? detail.index : -1;

  // TOUTE la liste, toujours. Avant, un ingrédient unique n'affichait qu'une
  // fenêtre de 5 lignes autour de lui : sur une bisque de 23 ingrédients on en
  // voyait 5, sans rien à faire défiler. La liste est déjà déroulante en CSS
  // (max-height + overflow-y) ; renderIngredientExcerpt l'amène tout seul sur
  // l'ingrédient repéré à l'ouverture de l'accordéon.
  // Le surlignage passe par les VARIANTES du mot, pas par une inclusion de
  // texte brut. Le moteur raisonne sur des mots de base ("patate") quand la
  // liste écrit tout autre chose ("pomme de terre") : la ligne promise n'était
  // alors pas mise en valeur. isMentionedInIngredients connaît les variantes
  // ET travaille sur des limites de mot, ce qui évite en prime d'allumer une
  // ligne parce qu'un mot en contient un autre.
  const rows = items.map((text, i) => ({
    num: i + 1,
    text,
    flagged: matchedIngredients.some((m) => isMentionedInIngredients(m, normalize(text)))
      || i === indexRepere,
  }));
  return { rows, caption: `${items.length} ingrédient(s) au total.` };
}

function renderIngredientExcerpt(ingredientsText, detail, verdictClassName) {
  const listEl = document.getElementById('ingredients-list');
  const captionEl = document.getElementById('ingredients-caption');
  if (!ingredientsText) {
    listEl.textContent = 'Non renseigné.';
    captionEl.textContent = '';
    return;
  }
  const { rows, caption } = buildIngredientExcerpt(ingredientsText, detail);
  listEl.innerHTML = rows
    .map((row) => {
      const num = String(row.num).padStart(2, '0');
      const text = row.flagged ? `<span class="flagged ${verdictClassName}">${row.text}</span>` : row.text;
      return `<div${row.flagged ? ' data-flagged="1"' : ''}><span class="idx">${num}</span>${text}</div>`;
    })
    .join('');
  captionEl.textContent = caption;
}

// QUEL TEXTE D'INGRÉDIENTS ANALYSER.
//
// Le dictionnaire du moteur ne connaît que le français et l'anglais. Or l'app
// lisait `ingredients_text`, c'est-à-dire la langue PRINCIPALE de la fiche :
// sur un produit belge ou allemand, elle cherchait "vanille" dans un texte
// néerlandais et concluait à son absence. Résultat mesuré le 2026-08-08 :
// 6 des 13 accusations d'un échantillon de 242 produits étaient fausses pour
// cette seule raison, dont ALPRO vanille et Lindt Excellence 70 % Cacao.
//
// Open Food Facts stocke pourtant les traductions à part : les six fiches
// fautives avaient toutes une version française ou anglaise. Il suffisait de
// demander le bon champ.
//
// Repli sur `ingredients_text` quand la fiche se déclare fr/en sans remplir le
// champ traduit - cas réel ("Kilishi", lang=en, ingredients_text_en vide).
// Si rien n'est lisible, on ne conclut PAS : mieux vaut se taire qu'accuser.
function ingredientsForAnalysis(product) {
  const fr = cleanText(product.ingredients_text_fr);
  if (fr) return { texte: fr, lisible: true };
  const en = cleanText(product.ingredients_text_en);
  if (en) return { texte: en, lisible: true };
  const brut = cleanText(product.ingredients_text);
  const langueConnue = product.lang === 'fr' || product.lang === 'en';
  return { texte: brut, lisible: !brut || langueConnue };
}

// OFF contient parfois la chaîne littérale "null"/"undefined" (saisie ou import
// de travers) : ne jamais l'afficher telle quelle à l'utilisateur.
function cleanText(value) {
  const text = String(value == null ? '' : value).trim();
  return (text === 'null' || text === 'undefined') ? '' : text;
}

// "Le nom suggère" / "Il y a vraiment" : vraie <ul> quand il y a plusieurs
// valeurs (avant : des <li> posés dans un <div>, HTML invalide).
// Proportions : "3,8 %" contient une virgule, donc impossible de les glisser
// dans la chaîne découpée ci-dessous. Elles arrivent en structure, alignées sur
// les parts, ce qui permet en plus de styler le chiffre et la mention "estimé".
function shareSuffix(part) {
  const frag = document.createDocumentFragment();
  const pct = document.createElement('b');
  pct.className = 'compare-pct';
  const v = part.valeur;
  pct.textContent = ' ' + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
    .toString().replace('.', ',') + ' %';
  frag.appendChild(pct);
  if (part.source === 'estime') {
    // Une estimation d'Open Food Facts n'est PAS une déclaration du fabricant.
    // Le dire est le minimum pour une app dont le sujet est l'honnêteté.
    const est = document.createElement('span');
    est.className = 'compare-est';
    est.textContent = ' estimé'; // espace réelle : un lecteur d'écran lirait sinon "3,8 %estimé"
    frag.appendChild(est);
  }
  return frag;
}

// "chocolat : présent" ne dit pas si c'est du VRAI chocolat ou du cacao
// dégraissé. La sous-ligne répond à la question que l'acheteuse se pose, en
// trois mots ; le "i" porte l'explication et la forme exacte. Afficher la
// forme brute ("cacao maigre en poudre") n'apprendrait rien à qui ignore le
// rôle du beurre de cacao - c'est ce qui a fait écarter cette variante.
function formeSuffix(forme) {
  const sub = document.createElement('span');
  sub.className = `compare-forme ${forme.vrai ? 'ok' : 'ko'}`;
  sub.textContent = forme.vrai ? 'vrai chocolat' : 'cacao en poudre, pas du chocolat';
  // Le "i" se pose SUR la mention qu'il explique, pas sur le nom de l'aliment
  // au-dessus : c'est "vrai chocolat" qui demande un pourquoi.
  // Il n'apparaît QUE si son popup existe déjà dans le HTML : au déploiement,
  // le nouveau app.js tourne un ou deux chargements avec l'ancien index.html,
  // et un "i" qui n'ouvre rien serait pire que pas de "i".
  if (document.getElementById('choco-modal')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'info-inline';
    btn.textContent = 'i';
    btn.setAttribute('aria-label', 'Pourquoi cette forme compte, ou non, comme du chocolat');
    btn.addEventListener('click', () => ouvrirFormeModal(forme));
    sub.appendChild(document.createTextNode(' '));
    sub.appendChild(btn);
  }
  return sub;
}

function ouvrirFormeModal(forme) {
  const modal = document.getElementById('choco-modal');
  if (!modal) return;
  const bloc = document.getElementById('choco-verdict');
  const reponse = document.getElementById('choco-answer');
  const found = document.getElementById('choco-modal-found');
  if (bloc) bloc.className = `choco-verdict ${forme.vrai ? 'ok' : 'ko'}`;
  if (reponse) reponse.textContent = forme.vrai ? 'C\'est du vrai chocolat' : 'Ce n\'est pas du chocolat';
  if (found) found.textContent = `Dans ce produit : ${forme.formes.join(', ')}`;
  modal.classList.remove('hidden');
}

function renderCompareValue(el, text, shares, formes) {
  el.innerHTML = '';
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  const shareAt = (i) => (Array.isArray(shares) && shares[i]) || null;
  const formeAt = (i) => (Array.isArray(formes) && formes[i]) || null;
  const garnir = (cible, i) => {
    if (shareAt(i)) cible.appendChild(shareSuffix(shareAt(i)));
    if (formeAt(i)) cible.appendChild(formeSuffix(formeAt(i)));
  };
  if (parts.length <= 1) {
    el.textContent = parts[0] || '';
    if (parts.length === 1) garnir(el, 0);
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'compare-list';
  parts.forEach((part, i) => {
    const li = document.createElement('li');
    li.textContent = part;
    garnir(li, i);
    ul.appendChild(li);
  });
  el.appendChild(ul);
}

// Proportion réelle de chaque aliment promis, alignée sur les libellés affichés.
// Renvoie null dès que l'alignement n'est pas garanti (règles de non-conformité
// dont le libellé est une phrase, pas une liste d'aliments) : mieux vaut aucun
// chiffre qu'un chiffre en face du mauvais mot.
function realShares(detail, product) {
  if (!detail || !detail.matched || !Array.isArray(product.ingredients)) return null;
  const mots = String(detail.matched).split(',').map((s) => s.trim()).filter(Boolean);
  const affiches = String(detail.compareReal || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (mots.length !== affiches.length) return null;
  const parts = mots.map((mot, i) => (
    // Le verdict "À vérifier" écrit déjà la proportion dans son libellé
    // ("homard : 3.8% seulement"), lue dans le texte. En rajouter une seconde
    // donnait "homard : 3.8% seulement 3,8 % estimé".
    affiches[i].includes('%') ? null : ingredientShare(mot, product.ingredients)
  ));
  return parts.some(Boolean) ? parts : null;
}

function renderResult(product) {
  const ingr = ingredientsForAnalysis(product);
  const { verdict, headline, legalNote, detail } = ingr.lisible || !ingr.texte
    ? detectVerdict(product.product_name, ingr.texte)
    : {
      verdict: 'foreign',
      headline: "Composition écrite dans une langue que l'app ne lit pas encore",
    };
  const meta = VERDICT_META[verdict];

  const productName = cleanText(product.product_name);
  document.getElementById('product-name').textContent = productName;
  document.getElementById('product-sub').textContent = cleanText(product.brands);

  // Dénomination légale : la loi oblige à dire ce que le produit EST, mais rien
  // n'impose que ce soit lisible - "Vanille framboise" s'étale pendant que
  // "crème glacée enrobée de chocolat" se cache en bas en minuscule. On la
  // remonte, mais seulement si elle apprend quelque chose (souvent OFF la
  // recopie à l'identique du nom commercial : inutile de l'afficher deux fois).
  // Elle est utile mais secondaire : elle occupait un bloc pleine largeur en
  // haut de fiche, devant le verdict. Elle passe derrière un "i", comme les
  // additifs, et n'apparaît toujours que si elle apprend quelque chose.
  const genericEl = document.getElementById('generic-info-btn');
  const generic = cleanText(product.generic_name);
  const saysSomethingNew = generic
    && normalize(generic) !== normalize(productName)
    && !normalize(productName).includes(normalize(generic));
  currentGenericName = saysSomethingNew ? generic : '';
  if (genericEl) genericEl.classList.toggle('hidden', !saysSomethingNew);
  // Code-barres affiché près de la version : permet à un utilisateur de nous
  // signaler un produit précis sans avoir l'emballage sous la main.
  const codeEl = document.getElementById('app-product-code');
  if (codeEl) codeEl.textContent = product.code ? ` · ${product.code}` : '';

  const verdictEl = document.getElementById('verdict-box');
  verdictEl.className = `alert ${meta.className}`;
  document.getElementById('stamp').textContent = meta.label;
  document.getElementById('verdict-text').textContent = headline;

  // Verdict "unknown" = OFF n'a pas les ingrédients. C'est le seul cas où on
  // propose une photo : l'utilisateur peut débloquer la vérification.
  setFillGapTarget(product, verdict);

  const flaggedAdditives = findFlaggedAdditives(product.additives_tags);
  currentRiskyAdditives = flaggedAdditives.risky;

  // Stocker les additifs du produit, DÉDOUBLONNÉS par code de base : OFF liste
  // les sous-formes en plus de la base (e322 + e322i, e500 + e500ii) alors que
  // c'est le même additif - sans regroupement, le popup en affichait 6 pour 4.
  const seenAdditiveBases = new Set();
  currentAllAdditives = (product.additives_tags || []).reduce((list, tag) => {
    const base = additiveBaseCode(tag);
    if (seenAdditiveBases.has(base)) return list;
    seenAdditiveBases.add(base);
    const isRisky = RISKY_ADDITIVES[tag] || RISKY_ADDITIVES[base];
    const isLimited = LIMITED_ADDITIVES[tag] || LIMITED_ADDITIVES[base];
    const category = isRisky ? 'risky' : (isLimited ? 'limited' : 'ok');
    const info = additiveInfo(base);
    list.push({
      code: base.replace('en:', '').toUpperCase(),
      name: info.name || null,
      role: info.role || '',
      category: category,
      reason: isRisky ? isRisky.reason : (isLimited ? isLimited.reason : null)
    });
    return list;
  }, []);

  const additiveAlertEl = document.getElementById('additive-alert');
  if (currentRiskyAdditives.length > 0) {
    additiveAlertEl.classList.remove('hidden');
    const first = currentRiskyAdditives[0];
    const suffix = currentRiskyAdditives.length > 1 ? ` (+${currentRiskyAdditives.length - 1} autre${currentRiskyAdditives.length > 2 ? 's' : ''})` : '';
    document.getElementById('additive-alert-text').textContent = `${first.code} - ${first.reason}${suffix}`;
  } else {
    additiveAlertEl.classList.add('hidden');
  }

  const compareEl = document.getElementById('compare-section');
  const compareRealCol = document.getElementById('compare-real-col');
  compareRealCol.className = `compare-col real ${meta.className}`;
  if (detail && detail.compareSuggest) {
    compareEl.classList.remove('hidden');
    // Affiche en liste si contient des virgules
    const suggestEl = document.getElementById('compare-suggest');
    const realEl = document.getElementById('compare-real');

    renderCompareValue(suggestEl, detail.compareSuggest);
    // "homard" devient "homard 3,8 %" : présence et proportion ne sont pas la
    // même promesse. Voir 2026-08-04-proportion-reelle-design.md
    renderCompareValue(realEl, detail.compareReal, realShares(detail, product), detail.formes);
  } else {
    compareEl.classList.add('hidden');
  }

  const nutriMeta = product.nutriscore_grade && NUTRISCORE_META[product.nutriscore_grade]
    ? { ...NUTRISCORE_META[product.nutriscore_grade], icon: product.nutriscore_grade.toUpperCase() }
    : null;
  renderScoreTile('nutriscore-icon', 'nutriscore-value', nutriMeta, 'Non renseigné');

  const novaMeta = product.nova_group && NOVA_META[product.nova_group]
    ? { ...NOVA_META[product.nova_group], icon: String(product.nova_group) }
    : null;
  renderScoreTile('nova-icon', 'nova-value', novaMeta, 'Non renseigné');

  // Couleur de la tuile additifs = niveau le plus dangereux présent (pas le nombre)
  let worstAdditiveCat;
  if (currentAllAdditives.some((a) => a.category === 'risky')) worstAdditiveCat = 'risky';
  else if (currentAllAdditives.some((a) => a.category === 'limited')) worstAdditiveCat = 'limited';
  else if (currentAllAdditives.length > 0) worstAdditiveCat = 'ok';
  // Le compteur affiché DOIT correspondre à la liste du popup : on compte la
  // liste dédoublonnée. additives_n (OFF) ne sert que si aucun tag n'est fourni.
  const additivesCount = currentAllAdditives.length > 0
    ? currentAllAdditives.length
    : (product.additives_n || 0);
  currentAdditivesCount = additivesCount;
  // Le "i" ouvre la liste des additifs : sans additif, il n'ouvrirait rien.
  const additivesInfoBtn = document.getElementById('additives-info-btn');
  if (additivesInfoBtn) additivesInfoBtn.classList.toggle('hidden', additivesCount === 0);
  renderScoreTile('additives-icon', 'additives-value', additivesMeta(additivesCount, worstAdditiveCat), 'Non renseigné');
  renderScoreTile('bio-icon', 'bio-value', bioMeta(product.labels_tags, product.ingredients_text), 'Non certifié');

  const legalAccordion = document.getElementById('legal-accordion');
  // Vaut aussi pour "À vérifier" : c'est précisément là que l'explication
  // ("chocolaté" n'est pas du chocolat) a le plus de valeur.
  if (legalNote && (verdict === 'misleading' || verdict === 'warning')) {
    legalAccordion.classList.remove('hidden');
    document.getElementById('legal-note').textContent = legalNote;
  } else {
    legalAccordion.classList.add('hidden');
  }

  // La liste AFFICHÉE est celle qui a été ANALYSÉE : sinon le surlignage
  // désignerait des lignes d'un autre texte que celui du verdict.
  renderIngredientExcerpt(ingr.texte, detail, meta.className);

  document.getElementById('freshness-text').textContent = freshnessText(product.last_modified_t);
  document.getElementById('off-link').href = `https://world.openfoodfacts.org/product/${product.code}`;

  document.getElementById('ingredients-accordion').removeAttribute('open');

  const alternativeAccordion = document.getElementById('alternative-accordion');
  alternativeAccordion.classList.add('hidden');
  const needsAlternative = verdict === 'misleading' || verdict === 'warning' || currentRiskyAdditives.length > 0;
  if (needsAlternative) {
    findAlternative(product).then((alternative) => {
      if (!alternative) return;
      const thumb = document.getElementById('alternative-thumb');
      thumb.style.visibility = 'visible';
      thumb.src = alternative.image_front_small_url || '';
      document.getElementById('alternative-name').textContent = alternative.product_name;
      document.getElementById('alternative-brand').textContent = alternative.brands || '';
      alternativeAccordion.classList.remove('hidden');
    }).catch((err) => {
      // Suggestion secondaire : si le proxy de recherche tombe, la fiche reste
      // parfaitement lisible. Sans ce catch, c'était un rejet non géré.
      dbg('[Alternative] indisponible:', err && err.message);
    });
  }

  showResultContent();

  // L'historique n'est écrit qu'une fois la fiche RÉELLEMENT affichée. Il était
  // écrit en tête de fonction : un plantage d'affichage laissait alors dans les
  // "derniers produits" une fiche que l'utilisateur n'avait jamais vue.
  addToHistory(product);
}

function showResultLoading() {
  document.getElementById('result-loading').classList.remove('hidden');
  document.getElementById('result-error').classList.add('hidden');
  document.getElementById('result-content').classList.add('hidden');
}

function showResultContent() {
  document.getElementById('result-loading').classList.add('hidden');
  document.getElementById('result-error').classList.add('hidden');
  document.getElementById('result-content').classList.remove('hidden');
}

// `title` : le titre était figé sur "Produit non trouvé", y compris quand la
// vraie cause était le réseau - l'écran se contredisait tout seul.
function showResultError(message, missingCode, title) {
  document.getElementById('result-loading').classList.add('hidden');
  document.getElementById('result-error').classList.remove('hidden');
  document.getElementById('result-content').classList.add('hidden');
  const titleEl = document.getElementById('error-title');
  if (titleEl) titleEl.textContent = title || 'Produit non trouvé';
  document.getElementById('error-message').textContent = message;
  // Proposer de contribuer UNIQUEMENT si le produit est absent d'OFF
  // (inutile de le proposer sur une panne réseau : le produit existe peut-être).
  setContributeTarget(missingCode || null);
}

// ===== Contribution à Open Food Facts ======================================
const CONTRIBUTE_URL = SEARCH_PROXY.replace(/\/search$/, '/contribute');

// La contribution écrit dans la VRAIE base publique d'Open Food Facts, sous le
// compte de l'app : une saisie approximative pollue les données de tout le monde
// et c'est l'app qui en porte la responsabilité. Tant que le formulaire n'est pas
// sûr (voir le champ dénomination officielle, encore manquant), on ne l'ouvre
// qu'en test et en local. La prod ne l'affiche pas.
const CONTRIBUTE_ENABLED = /(^|\/)etiquette-vraie-preview(\/|$)/.test(location.pathname)
  || location.hostname === 'localhost'
  || location.hostname === '127.0.0.1';

// Deuxième porte, ouverte celle-là. Le drapeau ci-dessus existe à cause du
// risque de saisie approximative dans une base publique. Le chemin photo n'a
// aucun champ texte : il ne peut rien écraser, il ne fait qu'ajouter une image.
// Pipeline validé en production réelle le 2026-08-02 (rev 1 -> 3, insights
// ingredient_detection et nutrient_extraction créés). Voir la spec
// docs/superpowers/specs/2026-08-02-contribution-fiches-incompletes-design.md
const PHOTO_CONTRIBUTE_ENABLED = true;
let contributeCode = null;
let contributePhoto = null; // data URL compressée

// Identifiant anonyme et stable, pour qu'OFF puisse modérer un utilisateur
// précis sans bannir toute l'app. Aucune donnée personnelle.
function anonUuid() {
  try {
    let id = localStorage.getItem('ev-uuid');
    if (!id) {
      id = 'ev-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      localStorage.setItem('ev-uuid', id);
    }
    return id;
  } catch (e) {
    return 'ev-anon';
  }
}

function setContributeTarget(code) {
  contributeCode = CONTRIBUTE_ENABLED ? code : null;
  contributePhoto = null;
  const block = document.getElementById('contribute-block');
  if (!block) return;
  block.classList.toggle('hidden', !contributeCode);
  document.getElementById('contribute-form').classList.add('hidden');
  document.getElementById('contribute-status').textContent = '';
  document.getElementById('contribute-status').className = 'contribute-status';
  document.getElementById('contrib-photo-info').textContent = '';
  document.getElementById('contrib-name').value = '';
  document.getElementById('contrib-brand').value = '';
  document.getElementById('contrib-photo').value = '';
}

// ===== Fiche incomplète : contribution photo seule =========================
let fillGapCode = null;
let fillGapPhoto = null;

// Trois états, lus dans les données d'OFF et non dans une mémoire locale : la
// question est ce que voit un utilisateur DIFFÉRENT de celui qui a envoyé.
function setFillGapTarget(product, verdict) {
  const block = document.getElementById('fillgap-block');
  if (!block) return;
  fillGapCode = null;
  fillGapPhoto = null;

  const openBtn = document.getElementById('fillgap-open');
  const sendBtn = document.getElementById('fillgap-send');
  const info = document.getElementById('fillgap-info');
  const status = document.getElementById('fillgap-status');
  document.getElementById('fillgap-photo').value = '';
  info.textContent = '';
  status.textContent = '';
  status.className = 'fillgap-status';
  sendBtn.classList.add('hidden');
  openBtn.classList.add('hidden');
  openBtn.classList.remove('subtle');

  if (!PHOTO_CONTRIBUTE_ENABLED || verdict !== 'unknown' || !product.code) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');

  if (product.image_ingredients_url) {
    // Photo déjà présente : ne pas en redemander. Chaque envoi REMPLACE l'image
    // de référence - une photo floue dégraderait une photo nette - et crée une
    // suggestion Robotoff de plus à traiter. On laisse tout de même une porte
    // pour le cas où la photo existante serait illisible, mais discrète : ce
    // n'est plus l'action attendue.
    document.getElementById('fillgap-title').textContent = 'Photo en attente';
    document.getElementById('fillgap-text').textContent =
      "Une photo des ingrédients a déjà été envoyée. Open Food Facts doit encore la vérifier.";
    openBtn.textContent = 'Elle est illisible ? En envoyer une meilleure';
    openBtn.classList.add('subtle');
  } else {
    document.getElementById('fillgap-title').textContent = 'Fiche incomplète';
    document.getElementById('fillgap-text').textContent =
      "Open Food Facts n'a pas la liste d'ingrédients de ce produit. Photographie-la : ça débloquera la vérification, pour toi et pour les autres.";
    openBtn.textContent = "Photographier la liste d'ingrédients";
  }
  openBtn.classList.remove('hidden');
  fillGapCode = product.code;
}

// Une photo de téléphone fait 3-8 Mo : on la réduit avant l'envoi (OFF exige
// au moins 640x160, 1600px de côté est largement suffisant pour l'OCR).
async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close && bitmap.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), w, h };
}

// Envoi partagé par les deux chemins de contribution : le formulaire "produit
// absent" (texte + photo) et le chemin photo seule sur fiche incomplète.
async function postContribution(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(CONTRIBUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'fr', uuid: anonUuid(), ...payload }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendContribution() {
  const statusEl = document.getElementById('contribute-status');
  const sendBtn = document.getElementById('btn-contribute-send');
  const name = document.getElementById('contrib-name').value.trim();
  const brand = document.getElementById('contrib-brand').value.trim();

  if (!CONTRIBUTE_ENABLED || !contributeCode) return;
  if (!name && !brand && !contributePhoto) {
    statusEl.className = 'contribute-status err';
    statusEl.textContent = 'Ajoute au moins le nom, la marque ou une photo.';
    return;
  }

  sendBtn.disabled = true;
  statusEl.className = 'contribute-status';
  statusEl.textContent = 'Envoi en cours...';

  try {
    const { ok } = await postContribution({
      code: contributeCode,
      product_name: name || undefined,
      brands: brand || undefined,
      image: contributePhoto || undefined,
    });
    if (ok) {
      statusEl.className = 'contribute-status ok';
      statusEl.textContent = 'Merci ! Ta contribution est envoyée à Open Food Facts.';
      document.getElementById('contribute-form').classList.add('hidden');
    } else {
      statusEl.className = 'contribute-status err';
      statusEl.textContent = 'Envoi impossible pour le moment. Réessaie plus tard.';
    }
  } catch (err) {
    statusEl.className = 'contribute-status err';
    statusEl.textContent = (err.name === 'AbortError')
      ? 'Envoi trop long. Réessaie.'
      : 'Problème de connexion. Réessaie.';
  } finally {
    sendBtn.disabled = false;
  }
}

function addToHistory(product) {
  productHistory = productHistory.filter(p => p.code !== product.code);
  productHistory.unshift(product);
  if (productHistory.length > MAX_HISTORY) productHistory.pop();
  renderHistory();
}

function renderHistory() {
  const historySection = document.getElementById('history-section');
  const historyList = document.getElementById('history-list');
  if (productHistory.length === 0) {
    historySection.classList.add('hidden');
    return;
  }
  historySection.classList.remove('hidden');
  historyList.innerHTML = productHistory.map(product => `
    <li class="history-item" role="button" tabindex="0" onclick="loadFromHistory('${product.code}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadFromHistory('${product.code}')}">
      <img class="history-thumb" src="${product.image_front_small_url || ''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="history-name">${product.product_name}</div>
    </li>
  `).join('');
}

function loadFromHistory(code) {
  selectProduct(code);
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const term = searchInput.value.trim();
  if (!term) return;

  // Un code-barres tapé dans la recherche : on ouvre directement la fiche.
  // (La recherche par TEXTE sur un code ne renvoie rien chez OFF.) Utile quand
  // le scan échoue, ou pour retrouver un produit signalé par son numéro.
  const asCode = term.replace(/[\s-]/g, '');
  if (/^\d{8,14}$/.test(asCode)) {
    selectProduct(asCode);
    return;
  }

  // Annuler la recherche précédente encore en cours (évite qu'une vieille
  // réponse lente écrase la nouvelle).
  if (currentSearchController) currentSearchController.abort();
  const controller = new AbortController();
  currentSearchController = controller;
  const isCurrent = () => controller === currentSearchController;

  searchStatus.textContent = 'Recherche...';
  resultsList.innerHTML = '';
  try {
    const products = await searchProducts(term, () => {
      if (isCurrent()) searchStatus.textContent = 'Ça bloque un peu, nouvelle tentative...';
    }, controller.signal);
    if (!isCurrent()) return; // une recherche plus récente a pris le relais
    renderResults(products);
  } catch (err) {
    if (!isCurrent()) return; // annulée/remplacée : ne pas afficher d'erreur
    searchStatus.textContent = searchErrorMessage(err);
  } finally {
    if (isCurrent()) currentSearchController = null;
  }
});

backButton.addEventListener('click', () => showScreen('home'));

document.getElementById('btn-search').addEventListener('click', () => showScreen('search'));
document.getElementById('btn-scan').addEventListener('click', () => showScreen('scan'));

// Repli du chemin iPhone : proposé après un échec de lecture, jamais de saisie
// de chiffres - personne ne tape un code-barres à 13 chiffres.
// GARDE OBLIGATOIRE : au déploiement, un appareil peut recevoir le nouveau
// app.js (servi network-first) AVEC l'ancien index.html (racine servie
// cache-first). Tout élément AJOUTÉ au HTML est donc absent pendant un cycle.
// Sans cette garde, l'exception ici tuait l'enregistrement des écouteurs
// suivants - c'est ce qui a cassé le bouton Scanner sur Android en v1.28.
// Enregistrer les écouteurs des NOUVEAUX éléments APRÈS ceux du coeur de l'app.
const shutterSearchBtn = document.getElementById('shutter-search');
if (shutterSearchBtn) shutterSearchBtn.addEventListener('click', () => showScreen('search'));
document.getElementById('btn-error-back').addEventListener('click', () => showScreen('home'));

// --- Contribution : ouverture du formulaire, photo, envoi ---
document.getElementById('btn-contribute').addEventListener('click', () => {
  document.getElementById('contribute-form').classList.remove('hidden');
  document.getElementById('contrib-name').focus();
});

document.getElementById('contrib-photo').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  const info = document.getElementById('contrib-photo-info');
  contributePhoto = null;
  if (!file) { info.textContent = ''; return; }
  info.textContent = 'Préparation de la photo...';
  try {
    const { dataUrl, w, h } = await compressImage(file);
    if (w < 640 || h < 160) {
      info.textContent = 'Photo trop petite pour être lisible. Reprends-la de plus près.';
      return;
    }
    contributePhoto = dataUrl;
    const kb = Math.round((dataUrl.length * 0.75) / 1024);
    info.textContent = `Photo prête (${w}×${h}, ~${kb} Ko).`;
  } catch (err) {
    info.textContent = 'Impossible de lire cette image.';
  }
});

document.getElementById('btn-contribute-send').addEventListener('click', sendContribution);

// --- Fiche incomplète : photo seule ---------------------------------------
document.getElementById('fillgap-open').addEventListener('click', () => {
  document.getElementById('fillgap-photo').click();
});

document.getElementById('fillgap-photo').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  const info = document.getElementById('fillgap-info');
  const sendBtn = document.getElementById('fillgap-send');
  fillGapPhoto = null;
  sendBtn.classList.add('hidden');
  if (!file) { info.textContent = ''; return; }
  info.textContent = 'Préparation de la photo...';
  try {
    const { dataUrl, w, h } = await compressImage(file);
    if (w < 640 || h < 160) {
      info.textContent = 'Photo trop petite pour être lisible. Reprends-la de plus près.';
      return;
    }
    fillGapPhoto = dataUrl;
    info.textContent = `Photo prête (${w}×${h}, ~${Math.round((dataUrl.length * 0.75) / 1024)} Ko).`;
    sendBtn.classList.remove('hidden');
  } catch (err) {
    info.textContent = 'Impossible de lire cette image.';
  }
});

document.getElementById('fillgap-send').addEventListener('click', async () => {
  const status = document.getElementById('fillgap-status');
  const sendBtn = document.getElementById('fillgap-send');
  if (!PHOTO_CONTRIBUTE_ENABLED || !fillGapCode || !fillGapPhoto) return;
  sendBtn.disabled = true;
  status.className = 'fillgap-status';
  status.textContent = 'Envoi en cours...';
  try {
    const { ok } = await postContribution({ code: fillGapCode, image: fillGapPhoto });
    if (ok) {
      status.className = 'fillgap-status ok';
      // Dire la vérité sur le délai : un annotateur d'OFF doit valider la
      // lecture. Sans ça l'utilisateur rescanne, revoit "impossible de vérifier"
      // et conclut que son envoi a échoué.
      status.textContent = 'Merci ! Ta photo est partie chez Open Food Facts. Les ingrédients apparaîtront une fois la lecture vérifiée par leur équipe : compte quelques jours.';
      document.getElementById('fillgap-open').classList.add('hidden');
      document.getElementById('fillgap-info').textContent = '';
      sendBtn.classList.add('hidden');
    } else {
      status.className = 'fillgap-status err';
      status.textContent = 'Envoi impossible pour le moment. Réessaie plus tard.';
    }
  } catch (err) {
    status.className = 'fillgap-status err';
    status.textContent = (err.name === 'AbortError')
      ? 'Envoi trop long. Réessaie.'
      : 'Problème de connexion. Réessaie.';
  } finally {
    sendBtn.disabled = false;
  }
});

// Initialize with home screen
(async () => {
  await loadAdditivesDatabase();
  // Lien direct vers un produit : ...?code=0065633468191
  // Permet de partager une fiche et de tester un produit sans l'avoir en main.
  const deepCode = (new URLSearchParams(location.search).get('code') || '').trim();
  if (/^\d{8,14}$/.test(deepCode)) {
    selectProduct(deepCode);
    return;
  }
  showScreen('home');
})();

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
    dbg('[SW] Registered:', registration);
  }).catch((err) => {
    console.error('[SW] Registration failed:', err);
  });
}

// L'accordéon est fermé au rendu : la liste n'a donc pas encore de dimensions
// et scrollTop n'y ferait rien. On l'amène sur l'ingrédient repéré au moment
// où l'utilisateur l'ouvre. On défile le CONTENEUR, pas la page.
document.getElementById('ingredients-accordion').addEventListener('toggle', (event) => {
  if (!event.target.open) return;
  const listEl = document.getElementById('ingredients-list');
  const cible = listEl.querySelector('[data-flagged]');
  if (!cible) { listEl.scrollTop = 0; return; }
  // offsetTop se mesure depuis le premier ancêtre POSITIONNÉ, qui n'est pas
  // cette liste : sur les Corn Flakes il valait 476 pour une liste haute de
  // 254, donc le calcul demandait un défilement supérieur au maximum et la
  // liste s'ouvrait tout en bas - l'ingrédient repéré, lui, était en haut.
  // La différence de rectangles est relative à la liste, quelle que soit la
  // mise en page autour.
  const ecart = cible.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
  const position = listEl.scrollTop + ecart;
  listEl.scrollTop = Math.max(0, position - listEl.clientHeight / 2 + cible.offsetHeight / 2);
});

// GARDES OBLIGATOIRES : ces éléments sont NOUVEAUX. Au déploiement, un appareil
// reçoit le nouveau app.js (network-first) avec l'ancien index.html (racine
// servie cache-first) : ils n'existent alors pas encore. Sans garde, l'exception
// tuait l'enregistrement de tous les écouteurs suivants - c'est ce qui a cassé
// le bouton Scanner sur Android en v1.28.
const genericBtn = document.getElementById('generic-info-btn');
const genericModal = document.getElementById('generic-modal');
if (genericBtn && genericModal) {
  const fermer = () => genericModal.classList.add('hidden');
  genericBtn.addEventListener('click', () => {
    document.getElementById('generic-modal-body').textContent = currentGenericName;
    genericModal.classList.remove('hidden');
  });
  document.getElementById('generic-modal-close').addEventListener('click', fermer);
  genericModal.querySelector('.modal-backdrop').addEventListener('click', fermer);
}

// Popup "forme du chocolat". Élément NOUVEAU : gardes obligatoires, sinon une
// exception ici tuerait tous les écouteurs enregistrés en dessous pendant le
// cycle où l'ancien index.html est encore servi (ce qui a cassé la v1.28).
const chocoModal = document.getElementById('choco-modal');
if (chocoModal) {
  const fermer = () => chocoModal.classList.add('hidden');
  const btnFermer = document.getElementById('choco-modal-close');
  if (btnFermer) btnFermer.addEventListener('click', fermer);
  const fond = chocoModal.querySelector('.modal-backdrop');
  if (fond) fond.addEventListener('click', fermer);
}

// Additives modal
document.getElementById('additives-info-btn').addEventListener('click', () => {
  const modal = document.getElementById('additives-modal');
  const body = document.getElementById('additives-modal-body');

  if (currentAllAdditives.length === 0) {
    // Cas honnête : OFF annonce un nombre mais ne fournit pas la liste des codes.
    body.innerHTML = currentAdditivesCount > 0
      ? `<div class="additive-item" style="border-left-color:var(--amber)"><div class="additive-code">${currentAdditivesCount} additif${currentAdditivesCount > 1 ? 's' : ''}</div><div class="additive-reason">Liste détaillée non fournie par Open Food Facts.</div></div>`
      : '<div class="additive-item" style="border-left-color:var(--green)"><div class="additive-code">Aucun additif</div></div>';
  } else {
    body.innerHTML = currentAllAdditives.map(additive => {
      const borderColorMap = { ok: 'var(--green)', limited: 'var(--amber)', risky: 'var(--red)' };
      const borderColor = borderColorMap[additive.category] || 'var(--green)';
      const title = additive.name ? `${additive.code} - ${additive.name}` : additive.code;
      const roleHtml = additive.role ? `<div class="additive-role">${additive.role}</div>` : '';
      const reasonHtml = additive.reason ? `<div class="additive-reason">${additive.reason}</div>` : '';
      return `
      <div class="additive-item" style="border-left-color:${borderColor}">
        <div class="additive-code">${title}</div>
        ${roleHtml}
        ${reasonHtml}
      </div>
    `;
    }).join('');
  }

  modal.classList.remove('hidden');
});

document.getElementById('additives-modal-close').addEventListener('click', () => {
  document.getElementById('additives-modal').classList.add('hidden');
});

document.querySelector('#additives-modal .modal-backdrop').addEventListener('click', () => {
  document.getElementById('additives-modal').classList.add('hidden');
});
