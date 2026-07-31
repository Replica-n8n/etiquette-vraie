// Logs de debug silencieux en prod. Passer à true pour diagnostiquer.
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

// Version LISIBLE affichée à l'utilisateur. À incrémenter à chaque livraison
// (v1.18 -> v1.19). Rien à voir avec le cache : celui-ci utilise BUILD.
const APP_VERSION = 'v1.21';
// Numéro de build = cache-busting. Doit correspondre à CACHE_NAME dans sw.js
// et aux ?v=... de index.html, sinon les utilisateurs gardent l'ancienne version.
const BUILD = '1784220022';
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
const MAX_HISTORY = 4;

let RISKY_ADDITIVES = {};
let LIMITED_ADDITIVES = {};


const VERDICT_META = {
  clean: { label: 'Clean', className: 'v-clean' },
  warning: { label: 'À vérifier', className: 'v-warning' },
  misleading: { label: 'Trompeur', className: 'v-misleading' },
  unknown: { label: 'Impossible de vérifier', className: 'v-unknown' },
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

async function startScanner() {
  if (scannerInitialized) return;
  const scanStatus = document.getElementById('scan-status');
  try {
    let lastDetectionTime = 0;
    const DEBOUNCE_DELAY = 1200; // 1.2 secondes - équilibre vitesse vs faux positifs

    // Validation STRICTE d'un code-barres : longueur standard (EAN-8/UPC-A/EAN-13)
    // ET chiffre de contrôle GS1 valide. Rejette le bruit que BarcodeDetector
    // peut renvoyer sur une image sans vrai code-barres.
    function isValidBarcode(code) {
      if (!/^\d+$/.test(code)) return false;
      if (![8, 12, 13].includes(code.length)) return false;
      return validateGS1Checksum(code);
    }

    // Chiffre de contrôle GS1 (EAN-13, EAN-8, UPC-A) : depuis la droite,
    // on pondère les chiffres (hors clé) par 3,1,3,1... ; clé = (10 - somme%10)%10.
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

    dbg('[Scanner] Initializing Barcode Detection API...');

    const qrReader = document.getElementById('qr-reader');

    // BarcodeDetector est natif sur Chrome Android. Sinon on ne peut pas scanner.
    if (!('BarcodeDetector' in window)) {
      console.warn('[Scanner] BarcodeDetector non supporté sur ce navigateur');
      scanStatus.textContent = 'Scanner non supporté ici. Utilise Chrome sur Android, ou cherche par nom.';
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
      return;
    }

    currentStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play();
    dbg('[Scanner] ✅ Caméra démarrée');
    scanStatus.textContent = '✓ Prêt — pointe vers un code-barres';
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
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const product = await fetchProduct(code);
      if (product) {
        renderResult(product);
        return;
      }
      lastError = new Error('product-not-found');
    } catch (err) {
      lastError = err; // erreur réseau/timeout, on réessaie
    }
    if (attempt < 2) {
      await wait(5000);
    }
  }

  const notFound = lastError.message === 'product-not-found';
  showResultError(
    notFound
      ? 'Introuvable dans Open Food Facts. Rappel : cette app ne couvre que les produits alimentaires emballés (pas les cosmétiques, livres, etc.).'
      : fetchErrorMessage(lastError),
    notFound ? code : null
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
    return 'La recherche Open Food Facts est momentanément indisponible (pas l\'app). Réessaie, ou scanne le code-barres — c\'est plus fiable.';
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
const PRODUCT_FIELDS = 'product_name,ingredients_text,brands,last_modified_t,image_front_small_url,code,nutriscore_grade,nova_group,additives_n,additives_tags,labels_tags,categories_tags';

async function fetchProduct(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${code}.json?fields=${PRODUCT_FIELDS}`;
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
      if (candidateVerdict.verdict !== 'clean') continue;
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
  try {
    const product = await fetchProduct(code);
    if (!product) {
      showResultError(fetchErrorMessage(new Error('product-not-found')), code);
      return;
    }
    renderResult(product);
  } catch (err) {
    dbg('[APP] selectProduct error:', err.message);
    showResultError(fetchErrorMessage(err));
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

// Extrait centré sur l'ingrédient signalé (évite d'afficher une liste entière
// quand elle fait plusieurs dizaines d'ingrédients).
function buildIngredientExcerpt(ingredientsText, detail) {
  const items = (ingredientsText || '')
    .split(',')
    .map((s) => s.trim())
    .map(s => s.replace(/^\d+[\s%(\-]*/, '').replace(/\s*\d+[\s%]*$/, '').trim()) // Nettoyer pourcentages début/fin
    .filter(Boolean);
  if (items.length === 0) return { rows: [], caption: '' };

  if (!detail || detail.index === undefined) {
    const shown = items;
    const caption = items.length > 0 ? `${items.length} ingrédient(s) au total.` : '';
    return {
      rows: shown.map((text, i) => ({ num: i + 1, text, flagged: false })),
      caption,
    };
  }

  // Extraire les ingrédients à mettre en évidence depuis detail.matched (ex: "boeuf, aubergines, menthe")
  const matchedIngredients = detail.matched
    ? detail.matched.split(',').map(s => s.trim().toLowerCase())
    : [];

  // Si on a plusieurs ingrédients à mettre en évidence, afficher TOUS les ingrédients
  // Sinon, afficher une fenêtre autour de l'ingrédient
  const hasMultipleMatches = matchedIngredients.length > 1;

  let windowStart, windowEnd;
  if (hasMultipleMatches) {
    // Afficher tous les ingrédients
    windowStart = 0;
    windowEnd = items.length;
  } else {
    // Fenêtre autour de l'ingrédient unique
    windowStart = Math.max(0, detail.index - 2);
    windowEnd = Math.min(items.length, detail.index + 3);
  }

  const rows = [];
  for (let i = windowStart; i < windowEnd; i += 1) {
    // Marquer comme flagged si l'ingrédient est dans la liste à mettre en évidence
    const isFlagged = matchedIngredients.some(matched => items[i].toLowerCase().includes(matched));
    rows.push({ num: i + 1, text: items[i], flagged: isFlagged || i === detail.index });
  }
  const hiddenBefore = windowStart;
  const hiddenAfter = items.length - windowEnd;
  const parts = [];
  if (hiddenBefore > 0) parts.push(`${hiddenBefore} avant`);
  if (hiddenAfter > 0) parts.push(`${hiddenAfter} après`);
  const caption = parts.length ? `${parts.join(', ')} - sur ${items.length} ingrédients au total.` : '';
  return { rows, caption };
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
      return `<div><span class="idx">${num}</span>${text}</div>`;
    })
    .join('');
  captionEl.textContent = caption;
}

// OFF contient parfois la chaîne littérale "null"/"undefined" (saisie ou import
// de travers) : ne jamais l'afficher telle quelle à l'utilisateur.
function cleanText(value) {
  const text = String(value == null ? '' : value).trim();
  return (text === 'null' || text === 'undefined') ? '' : text;
}

// "Le nom suggère" / "Il y a vraiment" : vraie <ul> quand il y a plusieurs
// valeurs (avant : des <li> posés dans un <div>, HTML invalide).
function renderCompareValue(el, text) {
  el.innerHTML = '';
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    el.textContent = parts[0] || '';
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'compare-list';
  for (const part of parts) {
    const li = document.createElement('li');
    li.textContent = part;
    ul.appendChild(li);
  }
  el.appendChild(ul);
}

function renderResult(product) {
  const { verdict, headline, legalNote, detail } = detectVerdict(product.product_name, product.ingredients_text);
  const meta = VERDICT_META[verdict];

  addToHistory(product);

  document.getElementById('product-name').textContent = cleanText(product.product_name);
  document.getElementById('product-sub').textContent = cleanText(product.brands);
  // Code-barres affiché près de la version : permet à un utilisateur de nous
  // signaler un produit précis sans avoir l'emballage sous la main.
  const codeEl = document.getElementById('app-product-code');
  if (codeEl) codeEl.textContent = product.code ? ` · ${product.code}` : '';

  const verdictEl = document.getElementById('verdict-box');
  verdictEl.className = `alert ${meta.className}`;
  document.getElementById('stamp').textContent = meta.label;
  document.getElementById('verdict-text').textContent = headline;

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
    renderCompareValue(realEl, detail.compareReal);
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

  renderIngredientExcerpt(product.ingredients_text, detail, meta.className);

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
    });
  }

  showResultContent();
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

function showResultError(message, missingCode) {
  document.getElementById('result-loading').classList.add('hidden');
  document.getElementById('result-error').classList.remove('hidden');
  document.getElementById('result-content').classList.add('hidden');
  document.getElementById('error-message').textContent = message;
  // Proposer de contribuer UNIQUEMENT si le produit est absent d'OFF
  // (inutile de le proposer sur une panne réseau : le produit existe peut-être).
  setContributeTarget(missingCode || null);
}

// ===== Contribution à Open Food Facts ======================================
const CONTRIBUTE_URL = SEARCH_PROXY.replace(/\/search$/, '/contribute');
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
  contributeCode = code;
  contributePhoto = null;
  const block = document.getElementById('contribute-block');
  if (!block) return;
  block.classList.toggle('hidden', !code);
  document.getElementById('contribute-form').classList.add('hidden');
  document.getElementById('contribute-status').textContent = '';
  document.getElementById('contribute-status').className = 'contribute-status';
  document.getElementById('contrib-photo-info').textContent = '';
  document.getElementById('contrib-name').value = '';
  document.getElementById('contrib-photo').value = '';
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

async function sendContribution() {
  const statusEl = document.getElementById('contribute-status');
  const sendBtn = document.getElementById('btn-contribute-send');
  const name = document.getElementById('contrib-name').value.trim();

  if (!contributeCode) return;
  if (!name && !contributePhoto) {
    statusEl.className = 'contribute-status err';
    statusEl.textContent = 'Ajoute au moins le nom ou une photo.';
    return;
  }

  sendBtn.disabled = true;
  statusEl.className = 'contribute-status';
  statusEl.textContent = 'Envoi en cours...';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(CONTRIBUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: contributeCode,
        product_name: name || undefined,
        image: contributePhoto || undefined,
        lang: 'fr',
        uuid: anonUuid(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
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

document.querySelector('.modal-backdrop').addEventListener('click', () => {
  document.getElementById('additives-modal').classList.add('hidden');
});
