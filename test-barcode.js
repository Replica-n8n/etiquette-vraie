// Tests du chemin de lecture par photo (iPhone / iPad).
//
//   node test-barcode.js
//
// Deux niveaux :
//  1. La validation partagée (isValidBarcode / validateGS1Checksum) est extraite
//     du VRAI app.js et exécutée telle quelle - pas une copie qui pourrait
//     diverger silencieusement du code livré.
//  2. Le décodeur ZXing-WASM vendu dans vendor/ est chargé et exercé sur une
//     image de code-barres réelle, s'il y en a une sous la main.
//
// Ce qui n'est PAS testable ici : la caméra, l'autorisation iOS, le
// comportement dans les navigateurs intégrés aux messageries. Cela demande un
// appareil réel. Voir docs/superpowers/specs/2026-08-02-scan-iphone-photo-design.md

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  const icon = ok ? '✅' : '❌';
  const detail = ok ? '' : `   (obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)})`;
  console.log(`${icon} ${label}${detail}`);
}

// --- 1. Validation, extraite du vrai app.js ---------------------------------

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} introuvable dans app.js`);
  let depth = 0;
  let seenBrace = false;
  for (let i = start; i < appSource.length; i++) {
    if (appSource[i] === '{') { depth++; seenBrace = true; }
    else if (appSource[i] === '}') {
      depth--;
      if (seenBrace && depth === 0) return appSource.slice(start, i + 1);
    }
  }
  throw new Error(`${name} : accolade fermante introuvable`);
}

const sandbox = {};
new Function(
  `${extractFunction('validateGS1Checksum')}\n${extractFunction('isValidBarcode')}\n` +
  'return { validateGS1Checksum, isValidBarcode };'
).call(sandbox);
const { isValidBarcode } = new Function(
  `${extractFunction('validateGS1Checksum')}\n${extractFunction('isValidBarcode')}\n` +
  'return { validateGS1Checksum, isValidBarcode };'
)();

console.log('--- Validation du code-barres (extraite de app.js) ---');

// Codes réels rencontrés pendant le développement.
check('UPC-A Nutella B-ready (062020172365)', isValidBarcode('062020172365'), true);
check('UPC-A White Creme Chips (056600902893)', isValidBarcode('056600902893'), true);
check('EAN-13 valide (5449000000996)', isValidBarcode('5449000000996'), true);
check('EAN-8 valide (96385074)', isValidBarcode('96385074'), true);

check('checksum faux rejeté', isValidBarcode('5449000000997'), false);
check('longueur 11 rejetée', isValidBarcode('12345678901'), false);
check('longueur 14 rejetée', isValidBarcode('12345678901234'), false);
check('lettres rejetées', isValidBarcode('12345678901A'), false);
check('chaîne vide rejetée', isValidBarcode(''), false);
check('espaces rejetés', isValidBarcode('0620 2017 2365'), false);

// --- 2. Décodeur ZXing-WASM ------------------------------------------------

async function testDecoder() {
  console.log('\n--- Décodeur ZXing-WASM (vendor/) ---');

  const wasmPath = path.join(__dirname, 'vendor', 'zxing', 'reader', 'zxing_reader.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.log('❌ vendor/zxing/reader/zxing_reader.wasm absent');
    fail++;
    return;
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  check('signature .wasm valide', wasmBytes.slice(0, 4).toString('hex'), '0061736d');
  console.log(`   poids : ${(wasmBytes.length / 1024 / 1024).toFixed(2)} Mo brut`);

  let zxing;
  try {
    zxing = await import('./vendor/zxing/reader/index.js');
  } catch (err) {
    console.log(`❌ le module ne se charge pas : ${err.message}`);
    fail++;
    return;
  }
  check('readBarcodes exporté', typeof zxing.readBarcodes, 'function');
  check('setZXingModuleOverrides exporté', typeof zxing.setZXingModuleOverrides, 'function');

  // En Node, Emscripten ferait un fetch() sur le chemin de fichier et
  // échouerait : on lui passe directement les octets. Dans le navigateur,
  // barcode-decode.js utilise locateFile avec une vraie URL.
  zxing.setZXingModuleOverrides({ wasmBinary: wasmBytes.buffer.slice(
    wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength) });

  // Image réelle, si disponible. Le dépôt n'embarque pas de photo de test :
  // on prend celle qui a servi à valider la contribution, si elle est encore là.
  const candidates = [
    path.join(__dirname, 'test-fixtures', 'barcode.jpg'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads',
              'WhatsApp Image 2026-08-01 at 14.22.49.jpeg'),
  ];
  const photo = candidates.find((p) => p && fs.existsSync(p));
  if (!photo) {
    console.log('⚠️  aucune image de test trouvée - décodage non exercé.');
    console.log('   Poser une photo de code-barres dans test-fixtures/barcode.jpg pour l\'activer.');
    return;
  }

  try {
    const results = await zxing.readBarcodes(
      new Blob([fs.readFileSync(photo)], { type: 'image/jpeg' }),
      { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128'], tryHarder: true }
    );
    const texts = (results || []).map((r) => r.text);
    console.log(`   image : ${path.basename(photo)}`);
    console.log(`   lu    : ${texts.length ? texts.join(', ') : '(rien)'}`);
    check('au moins un code-barres lu', texts.length > 0, true);
    if (texts.length) {
      check('le code lu passe la validation', isValidBarcode(texts[0]), true);
    }
  } catch (err) {
    console.log(`❌ décodage impossible : ${err.message}`);
    fail++;
  }
}

testDecoder().then(() => {
  console.log(`\n${pass}/${pass + fail} passent${fail ? ` · ${fail} ÉCHEC(S)` : ' · TOUT PASSE'}`);
  process.exit(fail ? 1 : 0);
});
