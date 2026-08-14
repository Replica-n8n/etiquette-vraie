// Proportion réelle de l'aliment promis · batterie de non-régression.
// Lancer :  node test-proportion.js
//
// Les fixtures sont de VRAIS extraits d'Open Food Facts, capturés depuis l'API
// (test-fixtures/off-ingredients.json), pas des objets inventés : les pièges de
// cette fonction viennent tous de la forme réelle des données.
//
// Voir docs/superpowers/specs/2026-08-04-proportion-reelle-design.md

const { ingredientShare, detectVerdict, chocolatePercent, partLabel } = require('./rules.js');
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

// Ce que l'acheteuse LIT : c'est la seule chose qui compte pour une borne.
function borne(label, word, fixture, attendu) {
  const r = ingredientShare(word, F[fixture].ingredients);
  check(label, r && r.source === 'borne' ? partLabel(r) : String(r && r.source), attendu);
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

console.log('\n--- Le cacao ne se chiffre plus comme un ingrédient ordinaire ---');
// Ces deux cas encodaient l'ancien comportement : sur "Pâte à tartiner aux
// NOISETTES et au cacao 40 %", OFF rattache les 40 % de la PÂTE au cacao, dont
// il estime par ailleurs la part à 16 % ; on retombait sur l'estimation.
//
// Décision du 2026-08-09 : plus aucun pourcentage de cacao par ce chemin. Un
// « % de cacao » sur un emballage désigne le cacao sec TOTAL - pâte, beurre et
// poudre - pas la part d'un ingrédient. Les deux nombres ne mesurent pas la
// même chose et ne seront jamais d'accord. Sur le Lindt Excellence, l'app
// affichait 31 % en face d'une étiquette qui déclare 70 %.
// Le seul chiffre retenu vient désormais de `chocolatePercent`, et seulement
// quand le nom et la liste portent le même.
check('cacao : aucune part d ingrédient', ingredientShare('cacao', F.biscuitsNutella.ingredients), null);
check('cacao : aucun chiffre non plus ici (rien dans le nom)',
  chocolatePercent('Biscuits NUTELLA Noisettes et Cacao x22 - 304g', 'pate a tartiner aux noisettes et au cacao 40%'),
  null);
check('cacao : le chiffre déclaré ET confirmé par le nom',
  (chocolatePercent('Excellence Noir 70% Cacao', 'Pate de cacao 70%, sucre, beurre de cacao') || {}).valeur,
  70);

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

// ⚠️ `renderCompareValue` n'existe plus : le panneau « Le nom suggère / Il y a
// vraiment » qu'elle remplissait a été retiré en v2.0, et sa dernière ligne de
// code le 2026-08-14. Ce que ces tests protègent vraiment, ce sont
// `realShares` et `shareSuffix`, qui vivent toujours et alimentent la
// sous-ligne du bandeau. On recompose donc ici l'assemblage minimal qu'ils
// faisaient, plutôt que de perdre la batterie.
const { shareSuffix, realShares } = new Function(
  'document', 'ingredientShare', 'partLabel',
  `${extract('shareSuffix')}\n${extract('realShares')}\n` +
  'return { shareSuffix, realShares };'
)(document, ingredientShare, partLabel);

function rendu(detail, produit) {
  const el = makeNode('div');
  el.textContent = detail.compareReal;
  const parts = realShares(detail, produit);
  const part = parts && parts[0];
  if (part) el.appendChild(shareSuffix(part));
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
// Le verdict "À vérifier" met déjà la proportion dans son libellé : ne pas
// en ajouter une seconde, dans un autre format qui plus est.
check('libellé contenant déjà un % : pas de doublon',
  rendu({ matched: 'homard', compareReal: 'homard : 3.8% seulement' }, { ingredients: F.bisqueEstimee.ingredients }),
  'homard : 3.8% seulement');

console.log('\n--- Catégorie : conclure, ou chiffrer ? Deux questions distinctes ---');
// La patate reste une CATÉGORIE pour la conclusion (muette si absente de la
// liste) sans l'être pour le chiffre : c'est la distinction que ces deux tests
// protégeaient, et elle tient toujours - le mot n'est plus bloqué par
// SHARE_BLOCKED_WORDS.
//
// ⚠️ RENVERSEMENT DU 2026-08-10, sur mesure. Ces deux lignes attendaient
// « poireau 60 % » et « pomme de terre 10 % ». Ces nombres n'existent pas :
// la fiche 3760325480433 ne déclare AUCUN pourcentage, et 60/20/10/5/5 est la
// suite qu'Open Food Facts produit mécaniquement pour cinq ingrédients - 19
// autres produits de l'échantillon portent exactement la même. Le chiffre ne
// disait pas « 60 % de poireau », il disait « premier de cinq ».
// L'app se tait donc, comme elle se tait déjà sur le cacao pour la même raison.
// À la place du faux chiffre : la BORNE, qui n'est pas un calcul d'OFF mais une
// conséquence de l'ordre légal. Poireau premier de cinq ⇒ au moins un cinquième.
// Pomme de terre troisième ⇒ au plus un tiers.
borne('poireau : au moins un cinquième', 'poireau', 'veloutePommeDeTerre', 'au moins 20 %');
borne('pomme de terre : au plus un tiers', 'patate', 'veloutePommeDeTerre', 'au plus 33 %');
// La distinction catégorie/chiffre reste vivante : dès qu'un pourcentage est
// DÉCLARÉ dans la fiche, la patate est chiffrable là où le beurre ne l'est pas.
const veloutéDéclaré = {
  ingredients: F.veloutePommeDeTerre.ingredients.map((i, n) => (
    n === 0 ? { ...i, percent: 45 } : i
  )),
};
check('une déclaration quelque part rouvre l\'estimation',
  JSON.stringify(ingredientShare('patate', veloutéDéclaré.ingredients)),
  JSON.stringify({ valeur: 10, source: 'estime' }));
// En face : "beurre" reste muet, sinon il attraperait le beurre de cacao.
part('beurre reste sans chiffre', 'beurre', 'biscuitsNutella', null);

check('libellé en phrase : aucun chiffre',
  rendu({ matched: 'miel', compareReal: 'Très faible taux de miel réel' }, { ingredients: F.bisqueDeclaree.ingredients }),
  'Très faible taux de miel réel');


console.log('\n--- Bornes : ce que l\'ordre légal garantit, et rien de plus ---');
// Une borne basse à 0 et une borne haute à 100 sont les valeurs par défaut :
// elles n'excluent rien, donc elles ne s'affichent pas.
check('borne inutile (0 à 100) : rien',
  ingredientShare('homard', [{ id: 'en:lobster', percent_min: 0, percent_max: 100 }]),
  null);
check('borne basse seule',
  partLabel(ingredientShare('homard', [{ id: 'en:lobster', percent_min: 25, percent_max: 100 }])),
  'au moins 25 %');
check('borne haute seule',
  partLabel(ingredientShare('homard', [{ id: 'en:lobster', percent_min: 0, percent_max: 50 }])),
  'au plus 50 %');
check('les deux bornes',
  partLabel(ingredientShare('homard', [{ id: 'en:lobster', percent_min: 20, percent_max: 33.333 }])),
  'entre 20 et 33 %');
// Le déclaré reste prioritaire sur la borne.
check('déclaré l emporte sur la borne',
  ingredientShare('homard', [{ id: 'en:lobster', percent: 12, percent_estimate: 12, percent_min: 5, percent_max: 40 }]).source,
  'declare');


console.log(`\n${pass}/${pass + fail} passent${fail ? ` · ${fail} ÉCHEC(S)` : ' · TOUT PASSE'}`);
process.exit(fail ? 1 : 0);