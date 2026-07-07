const homeScreen = document.getElementById('home-screen');
const searchScreen = document.getElementById('search-screen');
const scanScreen = document.getElementById('scan-screen');
const resultScreen = document.getElementById('result-screen');

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const resultsList = document.getElementById('results-list');
const backButton = document.getElementById('back-button');

let quaggaInitialized = false;
let lastOFFRequestTime = 0;
const OFF_MIN_DELAY_MS = 1000;
let currentRiskyAdditives = [];
let currentAllAdditives = [];

const VERDICT_META = {
  clean: { label: 'Clean', className: 'v-clean' },
  warning: { label: 'À vérifier', className: 'v-warning' },
  misleading: { label: 'Trompeur', className: 'v-misleading' },
  unknown: { label: 'Impossible de vérifier', className: 'v-unknown' },
};

const NUTRISCORE_META = {
  a: { color: '#2F6F4F', label: 'Très favorable' },
  b: { color: '#8CA13A', label: 'Favorable' },
  c: { color: '#B5792A', label: 'Moyen' },
  d: { color: '#C97A1F', label: 'Peu favorable' },
  e: { color: '#C0392B', label: 'Défavorable' },
};

const NOVA_META = {
  1: { color: '#2F6F4F', label: 'Non transformé' },
  2: { color: '#8CA13A', label: 'Peu transformé' },
  3: { color: '#B5792A', label: 'Transformé' },
  4: { color: '#C0392B', label: 'Ultra-transformé' },
};

const BIO_LABEL_TAGS = ['en:organic', 'en:eu-organic', 'fr:ab-agriculture-biologique'];

// Additifs faisant l'objet d'un signalement sanitaire documenté (avis EFSA/CIRC),
// pas une liste exhaustive de tous les additifs à controverse.
const ADDITIVE_RISK_MAP = {
  'en:e250': 'Nitrite de sodium — classé cancérogène probable pour l\'homme (CIRC, groupe 2A) en lien avec la charcuterie',
  'en:e251': 'Nitrate de sodium — précurseur de nitrites, mêmes réserves que E250',
  'en:e252': 'Nitrate de potassium — précurseur de nitrites, mêmes réserves que E250',
  'en:e320': 'BHA — suspecté perturbateur endocrinien, classé possiblement cancérogène (CIRC, groupe 2B)',
  'en:e321': 'BHT — suspecté perturbateur endocrinien',
  'en:e102': 'Tartrazine — associée à un risque d\'hyperactivité chez l\'enfant (avis EFSA)',
  'en:e110': 'Jaune orangé S — associé à un risque d\'hyperactivité chez l\'enfant (avis EFSA)',
  'en:e124': 'Rouge cochenille A — associé à un risque d\'hyperactivité chez l\'enfant (avis EFSA)',
  'en:e129': 'Rouge allura AC — associé à un risque d\'hyperactivité chez l\'enfant (avis EFSA)',
  'en:e171': 'Dioxyde de titane — additif interdit dans l\'alimentation en UE depuis 2022 (préoccupations de génotoxicité)',
  'en:e951': 'Aspartame — classé possiblement cancérogène (CIRC, groupe 2B)',
};

function findRiskyAdditives(additivesTags) {
  if (!Array.isArray(additivesTags)) return [];
  return additivesTags
    .filter((tag) => ADDITIVE_RISK_MAP[tag])
    .map((tag) => ({ code: tag.replace('en:', '').toUpperCase(), reason: ADDITIVE_RISK_MAP[tag] }));
}

function additivesMeta(additivesN) {
  if (additivesN === undefined || additivesN === null) return null;
  if (additivesN === 0) return { color: '#2F6F4F', icon: '0', label: 'Aucun' };
  if (additivesN <= 2) return { color: '#B5792A', icon: String(additivesN), label: `${additivesN} additif${additivesN > 1 ? 's' : ''}` };
  return { color: '#C0392B', icon: String(additivesN), label: `${additivesN} additifs` };
}

function bioMeta(labelsTags) {
  const isBio = Array.isArray(labelsTags) && labelsTags.some((tag) => BIO_LABEL_TAGS.includes(tag));
  if (isBio) return { color: '#2F6F4F', icon: '✓', label: 'Certifié' };
  return null;
}

function showScreen(screen) {
  homeScreen.classList.toggle('hidden', screen !== 'home');
  searchScreen.classList.toggle('hidden', screen !== 'search');
  scanScreen.classList.toggle('hidden', screen !== 'scan');
  resultScreen.classList.toggle('hidden', screen !== 'result');
  if (screen === 'scan') startQuaggaScanner();
  else if (quaggaInitialized) stopQuaggaScanner();
}

async function startQuaggaScanner() {
  if (quaggaInitialized) return;
  const scanStatus = document.getElementById('scan-status');
  try {
    console.log('[Quagga] Initializing');
    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        constraints: {
          facingMode: 'environment',
          width: { min: 640 },
          height: { min: 480 }
        },
        target: document.querySelector('#qr-reader')
      },
      decoder: {
        readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'codabar_reader', 'code_128_reader'],
        debug: false
      },
      locator: {
        halfSample: false,
        patchSize: 'medium'
      },
      frequency: 10,
      multiple: false
    }, (err) => {
      if (err) {
        console.error('[Quagga] Init error:', err);
        scanStatus.textContent = 'Erreur d\'accès à la caméra. Vérifie les permissions.';
        return;
      }
      console.log('[Quagga] Started successfully');
      Quagga.start();
      scanStatus.textContent = '✓ Caméra prête';
      quaggaInitialized = true;
    });

    Quagga.onDetected((result) => {
      if (result.codeResult && result.codeResult.code) {
        const code = result.codeResult.code;
        console.log('[Quagga] Code detected:', code);
        handleQrScan(code);
      }
    });
  } catch (err) {
    console.error('[Quagga] Error:', err);
    scanStatus.textContent = 'Erreur d\'accès à la caméra. Vérifie les permissions.';
  }
}

function stopQuaggaScanner() {
  if (!quaggaInitialized) return;
  try {
    Quagga.stop();
    Quagga.offDetected();
    quaggaInitialized = false;
  } catch (err) {
    console.error('[Quagga] Stop error:', err);
  }
}

async function handleQrScan(code) {
  if (!code) return;
  stopQuaggaScanner();
  showScreen('result');
  showResultLoading();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const product = await fetchProduct(code);
      if (product) {
        renderResult(product);
        return;
      }
    } catch (err) {
      // Erreur réseau, réessayer
    }
    if (attempt < 2) {
      await wait(5000);
    }
  }

  showResultError('Produit non trouvé sur Open Food Facts. Vérifie le code-barres et réessaie.');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOFF(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastOFFRequestTime;
  if (timeSinceLastRequest < OFF_MIN_DELAY_MS) {
    await wait(OFF_MIN_DELAY_MS - timeSinceLastRequest);
  }
  lastOFFRequestTime = Date.now();

  const response = await fetch(url);
  return response;
}

async function searchProducts(term, onRetry) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=15`;
  try {
    const response = await fetchOFF(url);
    if (!response.ok) throw new Error('network');
    const data = await response.json();
    return (data.products || []).filter((p) => p.product_name);
  } catch (err) {
    if (onRetry) onRetry();
    await wait(5000);
    const response = await fetchOFF(url);
    if (!response.ok) throw new Error('network');
    const data = await response.json();
    return (data.products || []).filter((p) => p.product_name);
  }
}

async function fetchProduct(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${code}.json?fields=product_name,ingredients_text,brands,last_modified_t,image_front_small_url,code,nutriscore_grade,nova_group,additives_n,additives_tags,labels_tags,categories_tags`;
  const response = await fetchOFF(url);
  if (!response.ok) throw new Error('network');
  const data = await response.json();
  if (data.status !== 1) return null;
  return data.product;
}

async function findAlternative(product) {
  const categories = product.categories_tags;
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const category = categories[categories.length - 1].replace(/^\w+:/, '');
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&sort_by=unique_scans_n`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetchOFF(url);
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const candidates = data.products || [];
    for (const candidate of candidates) {
      if (!candidate.code || candidate.code === product.code) continue;
      if (!candidate.ingredients_text || !candidate.product_name) continue;
      const candidateVerdict = detectVerdict(candidate.product_name, candidate.ingredients_text);
      if (candidateVerdict.verdict !== 'clean') continue;
      if (findRiskyAdditives(candidate.additives_tags).length > 0) continue;
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
    searchStatus.textContent = 'Aucun produit trouvé — essaie un autre nom ou une autre marque.';
    return;
  }
  searchStatus.textContent = '';
  products.forEach((product) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.innerHTML = `
      <img class="result-thumb" src="${product.image_front_small_url || ''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="result-text">
        <div class="result-name">${product.product_name}</div>
        <div class="result-brand">${product.brands || ''}</div>
      </div>
    `;
    li.addEventListener('click', () => selectProduct(product.code));
    resultsList.appendChild(li);
  });
}

async function selectProduct(code) {
  searchStatus.textContent = 'Chargement...';
  try {
    const product = await fetchProduct(code);
    if (!product) {
      searchStatus.textContent = 'Fiche produit introuvable sur Open Food Facts.';
      return;
    }
    searchStatus.textContent = '';
    renderResult(product);
    showScreen('result');
  } catch (err) {
    searchStatus.textContent = 'Erreur réseau — réessaie dans un instant.';
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
    iconEl.textContent = meta.icon;
    valueEl.textContent = meta.label;
  } else {
    iconEl.style.background = '#C7CBCE';
    iconEl.style.color = 'var(--ink-soft)';
    iconEl.textContent = '—';
    valueEl.textContent = fallbackLabel;
  }
}

// Extrait centré sur l'ingrédient signalé (évite d'afficher une liste entière
// quand elle fait plusieurs dizaines d'ingrédients).
function buildIngredientExcerpt(ingredientsText, detail) {
  const items = (ingredientsText || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return { rows: [], caption: '' };

  if (!detail || detail.index === undefined) {
    const shown = items.slice(0, 5);
    const caption = items.length > 5 ? `Et ${items.length - 5} ingrédient(s) supplémentaire(s).` : '';
    return {
      rows: shown.map((text, i) => ({ num: i + 1, text, flagged: false })),
      caption,
    };
  }

  const windowStart = Math.max(0, detail.index - 2);
  const windowEnd = Math.min(items.length, detail.index + 3);
  const rows = [];
  for (let i = windowStart; i < windowEnd; i += 1) {
    rows.push({ num: i + 1, text: items[i], flagged: i === detail.index });
  }
  const hiddenBefore = windowStart;
  const hiddenAfter = items.length - windowEnd;
  const parts = [];
  if (hiddenBefore > 0) parts.push(`${hiddenBefore} avant`);
  if (hiddenAfter > 0) parts.push(`${hiddenAfter} après`);
  const caption = parts.length ? `${parts.join(', ')} — sur ${items.length} ingrédients au total.` : '';
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

function renderResult(product) {
  const { verdict, headline, legalNote, detail } = detectVerdict(product.product_name, product.ingredients_text);
  const meta = VERDICT_META[verdict];

  document.getElementById('product-name').textContent = product.product_name;
  document.getElementById('product-sub').textContent = product.brands || '';

  const verdictEl = document.getElementById('verdict-box');
  verdictEl.className = `alert ${meta.className}`;
  document.getElementById('stamp').textContent = meta.label;
  document.getElementById('verdict-text').textContent = headline;

  const riskyAdditives = findRiskyAdditives(product.additives_tags);
  currentRiskyAdditives = riskyAdditives;

  // Stocker TOUS les additifs du produit
  currentAllAdditives = (product.additives_tags || []).map(tag => {
    const risk = ADDITIVE_RISK_MAP[tag];
    return {
      code: tag.replace('en:', '').toUpperCase(),
      isRisky: !!risk,
      reason: risk
    };
  });

  const additiveAlertEl = document.getElementById('additive-alert');
  if (riskyAdditives.length > 0) {
    additiveAlertEl.classList.remove('hidden');
    const first = riskyAdditives[0];
    const suffix = riskyAdditives.length > 1 ? ` (+${riskyAdditives.length - 1} autre${riskyAdditives.length > 2 ? 's' : ''})` : '';
    document.getElementById('additive-alert-text').textContent = `${first.code} — ${first.reason}${suffix}`;
  } else {
    additiveAlertEl.classList.add('hidden');
  }

  const compareEl = document.getElementById('compare-section');
  const compareRealCol = document.getElementById('compare-real-col');
  compareRealCol.className = `compare-col real ${meta.className}`;
  if (detail && detail.compareSuggest) {
    compareEl.classList.remove('hidden');
    document.getElementById('compare-suggest').textContent = detail.compareSuggest;
    document.getElementById('compare-real').textContent = detail.compareReal;
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

  renderScoreTile('additives-icon', 'additives-value', additivesMeta(product.additives_n), 'Non renseigné');
  renderScoreTile('bio-icon', 'bio-value', bioMeta(product.labels_tags), 'Non certifié');

  const legalAccordion = document.getElementById('legal-accordion');
  if (legalNote) {
    legalAccordion.classList.remove('hidden');
    document.getElementById('legal-note').textContent = legalNote;
  } else {
    legalAccordion.classList.add('hidden');
  }

  renderIngredientExcerpt(product.ingredients_text, detail, meta.className);

  document.getElementById('freshness-text').textContent = freshnessText(product.last_modified_t);
  document.getElementById('off-link').href = `https://world.openfoodfacts.org/product/${product.code}`;

  const alternativeAccordion = document.getElementById('alternative-accordion');
  alternativeAccordion.classList.add('hidden');
  const needsAlternative = verdict === 'misleading' || verdict === 'warning' || riskyAdditives.length > 0;
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

function showResultError(message) {
  document.getElementById('result-loading').classList.add('hidden');
  document.getElementById('result-error').classList.remove('hidden');
  document.getElementById('result-content').classList.add('hidden');
  document.getElementById('error-message').textContent = message;
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const term = searchInput.value.trim();
  if (!term) return;
  searchStatus.textContent = 'Recherche...';
  resultsList.innerHTML = '';
  try {
    const products = await searchProducts(term, () => {
      searchStatus.textContent = 'Ça bloque un peu, nouvelle tentative...';
    });
    renderResults(products);
  } catch (err) {
    searchStatus.textContent = 'Erreur réseau — réessaie dans un instant.';
  }
});

backButton.addEventListener('click', () => showScreen('home'));

document.getElementById('btn-search').addEventListener('click', () => showScreen('search'));
document.getElementById('btn-scan').addEventListener('click', () => showScreen('scan'));
document.getElementById('btn-error-back').addEventListener('click', () => showScreen('home'));

// Initialize with home screen
showScreen('home');

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((registration) => {
    console.log('[SW] Registered:', registration);
  }).catch((err) => {
    console.error('[SW] Registration failed:', err);
  });
}

// Additives modal
document.getElementById('additives-info-btn').addEventListener('click', () => {
  const modal = document.getElementById('additives-modal');
  const body = document.getElementById('additives-modal-body');

  if (currentAllAdditives.length === 0) {
    body.innerHTML = '<div class="additive-item" style="border-left-color:var(--green)"><div class="additive-code">Aucun additif</div></div>';
  } else {
    body.innerHTML = currentAllAdditives.map(additive => {
      const borderColor = additive.isRisky ? 'var(--red)' : 'var(--green)';
      const reasonHtml = additive.reason ? `<div class="additive-reason">${additive.reason}</div>` : '';
      return `
      <div class="additive-item" style="border-left-color:${borderColor}">
        <div class="additive-code">${additive.code}</div>
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
