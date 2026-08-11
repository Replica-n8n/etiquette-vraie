// Produits RÉELS accusés à tort, figés ici avec leur code-barres.
// Lancer :  node test-produits-reels.js
//
// Tous ont été trouvés le 2026-08-10 en interrogeant Open Food Facts, pas en
// réfléchissant : les batteries de tests étaient au vert pendant que ces
// six étiquettes honnêtes se faisaient traiter de menteuses. Un test dit si le
// code fait ce que j'ai pensé ; il ne dit jamais si j'ai pensé juste.
//
// Chaque cas garde son CODE-BARRES : il doit rester rejouable à la main sur
// l'app, et vérifiable contre l'emballage réel.

const { detectVerdict } = require('./rules.js');

let pass = 0;
const echecs = [];
function honnete(code, nom, ingredients, pourquoi) {
  const v = detectVerdict(nom, ingredients);
  if (v.verdict !== 'misleading' && v.verdict !== 'warning') { pass++; return; }
  echecs.push(`${code} ${nom}\n      accusé : ${v.headline}\n      or : ${pourquoi}`);
}

console.log('--- Le mot promis EST là, sous un autre nom ---');

// « Surimi » est une CATÉGORIE de produit, comme « fromage » ou « beurre » :
// sa liste d'ingrédients dit de quoi il est fait, jamais son propre nom.
honnete('3760048441636', 'Batonnet de surimi',
  "eau, chair de poisson 27,8%, amidon (dont ble), blanc d'oeuf, huile de colza, arome (dont crustaces), sel, sucre",
  'la chair de poisson EST le surimi');

// « Viande bovine » est la formule la plus courante des étiquettes françaises ;
// « boeuf » n'y figure presque jamais.
honnete('3292590864101', 'Boulettes au boeuf',
  'viande bovine hachee : origine francaise a 51%, eau, proteine de soja, chapelure (farine de ble)',
  'viande bovine = boeuf');
honnete('_variante_', 'Steak hache pur boeuf', 'viande bovine 100%', 'viande bovine = boeuf');
honnete('_variante_', 'Lasagnes au boeuf', 'pates, viande bovine 12%, tomate', 'viande bovine = boeuf');

// ⚠️ Le correctif « viande bovine » a d'abord créé trois fausses accusations :
// dans un NOM, « bovin » est un adjectif d'origine, pas une promesse de viande.
// D'où l'entrée au NAME_DETECTION_BLOCKLIST : compris dans une liste, jamais
// cherché dans un nom.
honnete('_variante_', 'Gelatine bovine', 'gelatine', "« bovine » décrit l'origine, pas le contenu");
honnete('_variante_', 'Collagene bovin', 'collagene hydrolyse', 'idem');
honnete('_variante_', 'Presure bovine', 'presure, eau, sel', 'idem');

console.log('--- Une analyse minérale n\'est pas une liste d\'ingrédients ---');
// Vittel (7613036249928) et Contrex (7613035866386) ont un TABLEAU d'analyse
// dans le champ ingrédients. Trouvés en mesurant le ratio d'ingrédients non
// reconnus par Open Food Facts : sur 296 fiches, 5 n'en reconnaissaient aucun,
// et ces deux-là étaient les seules vraiment corrompues.
function illisible(code, nom, ingredients, pourquoi) {
  const v = detectVerdict(nom, ingredients);
  if (v.verdict === 'unknown') { pass++; return; }
  echecs.push(`${code} ${nom}\n      verdict ${v.verdict} : ${v.headline}\n      or : ${pourquoi}`);
}
illisible('7613036249928', 'Vittel',
  'Mineralisation caracteristique (mg/L) : Calcium 240 / Magnesium 42 / Sodium 5,2 / Sulfate 400',
  "c'est une analyse d'eau, pas une liste");
illisible('7613035866386', 'CONTREX eau minerale naturelle',
  'Analyse en mg/l : Calcium 468 / Magnesium 74,5 / Sodium 9,4 / Sulfate 1121 / Residu sec 2125',
  "c'est une analyse d'eau, pas une liste");
// ⚠️ Les trois autres « rien reconnu » de la mesure sont des listes VALIDES.
// Une règle fondée sur ce ratio les aurait fait taire : elle a été rejetée.
honnete('20003166', 'Flocons d avoine', "100% flocons d'avoine complets.", 'liste valide, tout est reconnu par l\'œil humain');
honnete('3088543506255', "Sirop d'Agave", 'agave syrup', 'liste valide');
honnete('6111035000430', 'Sidi Ali', 'une eau minerale naturelle', 'liste valide');
// Le calcium et le magnésium restent des ingrédients ordinaires.
honnete('_variante_', 'Yaourt nature', 'lait, ferments lactiques, carbonate de calcium', 'le calcium est un additif courant');

console.log('--- Un verbe n\'est pas un aliment ---');

// « pêchées » est le participe du verbe pêcher. Le fruit, lui, ne se conjugue
// pas : une pêche n'est jamais « pêchée ».
honnete('0014352990933', 'Sardines de l\'Atlantique Nord-Est pechees par des bateaux francais',
  "Sardines, huile d'olive vierge extra, piment d'Espelette 0.7%, sel",
  'pechees = participe de pecher, pas le fruit');
honnete('_variante_', 'Thon peche a la ligne', 'thon, eau, sel', 'peche = verbe');
honnete('_variante_', 'Maquereaux peches par nos pecheurs bretons', 'maquereaux, huile, sel', 'peche = verbe');

console.log('--- ... sans casser le fruit ---');
// Le correctif ne doit pas rendre l'app aveugle à la vraie pêche.
const fruit1 = detectVerdict('Tarte aux peches', 'farine, sucre, arome peche');
if (/peche|pêche/i.test(fruit1.headline) && fruit1.verdict === 'misleading') pass++;
else echecs.push(`Tarte aux peches : le fruit n'est plus vu — ${fruit1.verdict} ${fruit1.headline}`);

const fruit2 = detectVerdict('Compote peche abricot', 'pommes, sucre, arome');
if (fruit2.verdict === 'misleading') pass++;
else echecs.push(`Compote peche abricot : le fruit n'est plus vu — ${fruit2.verdict} ${fruit2.headline}`);

const fruit3 = detectVerdict('Yaourt a la peche', 'lait, sucre, peches 8%');
if (fruit3.verdict === 'clean') pass++;
else echecs.push(`Yaourt a la peche : ${fruit3.verdict} ${fruit3.headline}`);

console.log('--- Non-régression : les vraies tromperies passent toujours ---');
const vrai1 = detectVerdict('Filet de cabillaud', 'pangasius, eau, sel');
if (/pangasius/.test(vrai1.headline)) pass++;
else echecs.push(`cabillaud/pangasius perdu : ${vrai1.headline}`);
const vrai2 = detectVerdict('Salade de crabe', 'surimi, mayonnaise, sel');
if (/surimi/.test(vrai2.headline)) pass++;
else echecs.push(`crabe/surimi perdu : ${vrai2.headline}`);
// Le surimi devenu catégorie ne doit pas empêcher de le nommer comme remplaçant.
const vrai3 = detectVerdict('Batonnets saveur crabe', 'chair de poisson, amidon, arome crabe');
if (vrai3.verdict === 'warning') pass++;
else echecs.push(`batonnets saveur crabe : ${vrai3.verdict} ${vrai3.headline}`);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
}

// ---------------------------------------------------------------------------
// CONNUS, PAS ENCORE CORRIGÉS - affichés, non comptés.
// Ces deux-là ne relèvent pas du dictionnaire mais de la QUALITÉ DE LA DONNÉE :
// Open Food Facts range parfois n'importe quoi dans le champ ingrédients. Il
// faut une mesure avant de fixer un seuil, sinon on refait l'erreur du seuil
// arbitraire supprimée le 2026-08-04.
// ---------------------------------------------------------------------------
console.log('\n--- CONNUS, non corrigés (tâches #9 et #10) ---');
const ouverts = [
  ['5410148493605', 'Filet de cabillaud vin blanc & legumes', 'voedingswaarden', 'la liste tient en un mot néerlandais'],
  ['5400141550603', 'Pate a tartiner aux noisettes', 'cochons', 'la liste vaut « cochons »'],
  ['4056489840848', 'Filet de cabillaud', '65% merluzzo nordico, acqua, farina di frumento', 'liste en italien dans un champ accepté'],
];
for (const [code, nom, ingr, pourquoi] of ouverts) {
  const v = detectVerdict(nom, ingr);
  console.log(`  ${code} ${nom}\n      ${v.verdict} : ${v.headline}\n      (${pourquoi})`);
}

if (echecs.length) process.exit(1);
console.log('\nTOUT PASSE');
