// Les traces d'allergènes ne sont pas des ingrédients.
// Lancer :  node test-traces.js
//
// « Peut contenir : lait, soja » avertit sur ce que l'usine côtoie. Ce n'est pas
// une déclaration de composition, et Open Food Facts la range à part, dans
// `traces_tags`. L'app, elle, la découpait sur les virgules AVANT de retirer la
// prose : la tête de la phrase partait bien, la QUEUE survivait en se faisant
// passer pour un ingrédient.
//
// Mesuré le 2026-08-24 sur 46 fiches réelles parmi les plus scannées :
// 8 affichaient un faux ingrédient, soit 17,4 %. Chaque cas ci-dessous vient
// d'un vrai emballage.

const { couperTraces, detectVerdict, splitIngredientList } = require('./rules.js');

let pass = 0;
const echecs = [];
function check(nom, condition, detail = '') {
  if (condition) { pass++; return; }
  echecs.push(`${nom}${detail ? ' — ' + detail : ''}`);
}

// ---- 1. La coupe elle-même, sur de vrais textes -----------------------------
const COUPES = [
  ['Cocoa Camino (0752612000113)',
    "Cacao alcalinisé, Carbonate de potassium (correcteur d'acidité). Peut contenir : Lait, Soya.",
    "Cacao alcalinisé, Carbonate de potassium (correcteur d'acidité)"],
  ['Lindt Excellence 85 %',
    'Sucre, beurre de cacao. Peut contenir des fruits à coque, du soja et des graines de sésame.',
    'Sucre, beurre de cacao'],
  ['Wasa',
    'FARINE DE SEIGLE, SEL. Peut contenir LAIT, MOUTARDE et SOJA.',
    'FARINE DE SEIGLE, SEL'],
  ['traces éventuelles',
    'Tomates, sel. Traces éventuelles de gluten.',
    'Tomates, sel'],
  ['traces sans adjectif',
    'Tomates, sel. Traces de gluten.',
    'Tomates, sel'],
  ['anglais',
    'Wheat flour, sugar. May contain milk.',
    'Wheat flour, sugar'],
  ['atelier partagé',
    'Eau, sucre, fabriqué dans un atelier utilisant des arachides.',
    'Eau, sucre'],
  ['texte déjà normalisé (sans accents, minuscules)',
    'sucre, cacao. peut contenir des traces de lait',
    'sucre, cacao'],
];
for (const [nom, avant, attendu] of COUPES) {
  check(`coupe : ${nom}`, couperTraces(avant) === attendu, JSON.stringify(couperTraces(avant)));
}

// ---- 2. Ce qu'on ne coupe JAMAIS -------------------------------------------
// Une fiche sans liste ne dit pas « rien à signaler », elle dit « je ne peux pas
// vérifier ». Vider le texte fabriquerait un silence, donc on garde tel quel.
check('marqueur en tête : rien n\'est coupé',
  couperTraces('Peut contenir du lait.') === 'Peut contenir du lait.');
check('aucun marqueur : le texte est intact',
  couperTraces('Eau, sucre, sel.') === 'Eau, sucre, sel.');
check('texte vide : pas d\'exception', couperTraces('') === '' && couperTraces(null) === '');

// ---- 3. Plus aucune trace ne devient une ligne de la liste ------------------
// C'est le défaut visible : « 03 Soya » sous un cacao qui n'en contient pas.
for (const [nom, texte] of COUPES.map(([n, a]) => [n, a])) {
  const lignes = splitIngredientList(couperTraces(texte));
  const fautif = lignes.find((l) => /soja|soya|sesame|sésame|moutarde|gluten|arachide|lait\b|milk/i.test(l));
  check(`liste : aucune trace affichée (${nom})`, !fautif, fautif);
}

// ---- 4. Le moteur ne doit plus être ABSOUS par une trace --------------------
// `isMentionedInIngredients` teste le texte ENTIER : un « peut contenir des
// noisettes » suffisait à confirmer une noisette absente du produit. C'est la
// faute la plus grave du lot, parce qu'elle éteint une accusation fondée.
const sansNoisette = detectVerdict(
  'Barre goût noisette',
  'Sucre, huile de palme, arôme. Peut contenir des noisettes.',
);
check('moteur : une trace ne confirme pas un aliment promis',
  sansNoisette.verdict !== 'clean', JSON.stringify(sansNoisette.verdict));

// Et l'inverse doit rester vrai : un aliment RÉELLEMENT présent reste confirmé,
// même quand une ligne de traces suit la liste.
const avecNoisette = detectVerdict(
  'Barre aux noisettes',
  'Noisettes 30%, sucre, huile de palme. Peut contenir du lait.',
);
check('moteur : un aliment présent reste confirmé malgré la ligne de traces',
  avecNoisette.verdict === 'clean', JSON.stringify(avecNoisette.verdict));

console.log(`\n${pass}/${pass + echecs.length} tests traces au vert`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
