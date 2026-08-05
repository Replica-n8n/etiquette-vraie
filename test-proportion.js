// Proportion réelle de l'aliment promis — batterie de non-régression.
// Lancer :  node test-proportion.js
//
// Les fixtures sont de VRAIS extraits d'Open Food Facts, capturés depuis l'API
// (test-fixtures/off-ingredients.json), pas des objets inventés : les pièges de
// cette fonction viennent tous de la forme réelle des données.
//
// Voir docs/superpowers/specs/2026-08-04-proportion-reelle-design.md

const { ingredientShare, detectVerdict } = require('./rules.js');
const F = require('./test-fixtures/off-ingredients.json');

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `\n     obtenu ${JSON.stringify(actual)} / attendu ${JSON.stringify(expected)}`}`);
}

function part(label, word, fixture, attendu) {
  const r = ingredientShare(word, F[fixture].ingredients);
  const vu = r ? { v: Math.round(r.valeur * 10) / 10, s: r.source } : null;
  check(label, vu, attendu);
}

console.log('--- Pourcentage déclaré par le fabricant (QUID) ---');
// en:american-lobster, premier niveau, percent = 12 -> déclaré, pas estimé.
part('homard déclaré à 12 %', 'homard', 'bisqueDeclaree', { v: 12, s: 'declare' });
// Le mot ANGLAIS doit donner le même résultat : la traduction va dans les deux sens.
part('lobster (EN) trouve le même', 'lobster', 'bisqueDeclaree', { v: 12, s: 'declare' });

console.log('\n--- Estimation calculée par Open Food Facts ---');
part('homard estimé, sous-ingrédient', 'homard', 'bisqueEstimee', { v: 3.8, s: 'estime' });

console.log('\n--- LE PIÈGE : ne pas confondre le composé et son ingrédient ---');
// "Pâte à tartiner aux NOISETTES" pèse 54 % ; la noisette elle-même 1,5 %.
// Chercher dans le texte libre renvoyait 54 %, soit 36 fois trop.
const noisette = ingredientShare('noisette', F.biscuitsNutella.ingredients);
check('noisette ≠ 54 % (poids de la pâte à tartiner)', noisette && noisette.valeur > 50, false);
part('noisette = sa part réelle', 'noisette', 'biscuitsNutella', { v: 1.5, s: 'estime' });

console.log('\n--- Déclaré non corroboré : on ne le présente pas comme une déclaration ---');
// Étiquette réelle : "Pâte à tartiner aux NOISETTES et au cacao 40% (...)".
// Les 40 % sont ceux de la PÂTE À TARTINER, mais l'analyseur d'OFF les rattache
// à "cacao", dont il estime par ailleurs la part à 16 %. Les deux sources se
// contredisent : on retombe sur l'estimation plutôt que d'annoncer 40 % déclarés.
const cacao = ingredientShare('cacao', F.biscuitsNutella.ingredients);
check('cacao : pas 40 % déclarés', cacao && cacao.source, 'estime');
check('cacao : la valeur estimée', cacao && Math.round(cacao.valeur), 16);

console.log('\n--- Absence de chiffre : ne rien inventer ---');
// L'ingrédient "_Select roasted peanuts_" n'est pas rattaché à la taxonomie.
part('hors taxonomie -> null', 'arachide', 'peanutButter', null);
part('mot de catégorie -> null', 'beurre', 'peanutButter', null);
part('aliment absent -> null', 'fraise', 'bisqueDeclaree', null);
check('liste vide -> null', ingredientShare('homard', []), null);
check('liste absente -> null', ingredientShare('homard', undefined), null);
check('mot vide -> null', ingredientShare('', F.bisqueDeclaree.ingredients), null);

console.log('\n--- Non-régression : detectVerdict sans le 3e argument ---');
// L'ajout doit être strictement facultatif. Si ce test casse, tout l'existant
// est menacé - c'est la garantie que les 85 cas de test-rules.js restent valides.
const avant = detectVerdict('Biscuit fraise', 'farine, sucre, arome fraise');
check('verdict inchangé', avant.verdict, 'misleading');

console.log('\n--- Rendu affiché (fonctions extraites du vrai app.js) ---');
// Même technique que test-barcode.js : on exécute le code RÉELLEMENT livré,
// pas une copie qui pourrait diverger. DOM minimal, juste ce qu'il utilise.
const fs = require('fs');
const appSource = fs.readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');

function extract(name) {
  const start = appSource.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} introuvable dans app.js`);
  let depth = 0, seen = false;
  for (let i = start; i < appSource.length; i++) {
    if (appSource[i] === '{') { depth++; seen = true; }
    else if (appSource[i] === '}') { depth--; if (seen && depth === 0) return appSource.slice(start, i + 1); }
  }
  throw new Error(`${name} : accolade fermante introuvable`);
}

function makeNode(tag) {
  return {
    tagName: tag, className: '', _text: '', children: [],
    set textContent(v) { this._text = v; this.children = []; },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set innerHTML(v) { this._text = ''; this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
  };
}
const document = {
  createElement: makeNode,
  createDocumentFragment: () => makeNode('#fragment'),
};

const { renderCompareValue, realShares } = new Function(
  'document', 'ingredientShare',
  `${extract('shareSuffix')}\n${extract('renderCompareValue')}\n${extract('realShares')}\n` +
  'return { renderCompareValue, realShares };'
)(document, ingredientShare);

function rendu(detail, produit) {
  const el = makeNode('div');
  renderCompareValue(el, detail.compareReal, realShares(detail, produit));
  return el.textContent.replace(/\s+/g, ' ').trim();
}

check('déclaré : pas de mention "estimé"',
  rendu({ matched: 'homard', compareReal: 'homard' }, { ingredients: F.bisqueDeclaree.ingredients }),
  'homard 12 %');

check('estimé : la mention est présente',
  rendu({ matched: 'homard', compareReal: 'homard' }, { ingredients: F.bisqueEstimee.ingredients }),
  'homard 3,8 % estimé');

check('sans chiffre : le mot seul, rien d\'inventé',
  rendu({ matched: 'arachide', compareReal: 'arachide' }, { ingredients: F.peanutButter.ingredients }),
  'arachide');

check('produit sans ingrédients structurés',
  rendu({ matched: 'homard', compareReal: 'homard' }, {}),
  'homard');

// Les règles de non-conformité ont un libellé en PHRASE : aucun alignement
// possible avec les mots, donc aucun chiffre - jamais en face du mauvais mot.
check('libellé en phrase : aucun chiffre',
  rendu({ matched: 'miel', compareReal: 'Très faible taux de miel réel' }, { ingredients: F.bisqueDeclaree.ingredients }),
  'Très faible taux de miel réel');

console.log(`\n${pass}/${pass + fail} passent${fail ? ` — ${fail} ÉCHEC(S)` : ' — TOUT PASSE'}`);
process.exit(fail ? 1 : 0);
