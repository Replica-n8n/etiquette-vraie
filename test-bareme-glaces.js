// Barème légal : familles GLACE et SORBET.
// Lancer :  node test-bareme-glaces.js
//
// Mesuré sur 607 desserts glacés réels d'Open Food Facts avant d'être codé :
//   33,3 % du rayon reçoit un rang, et le partage est le plus net de toutes les
//   familles livrées · 89 « glace » contre 53 « crème glacée ».
// C'est exactement l'écart que l'app existe pour dire : « glace » n'exige
// AUCUNE matière grasse laitière (le Code autorise une graisse exclusivement
// végétale), « crème glacée » en exige 5 %, exclusivement laitières.
//
// Les deux règles dures du barème s'appliquent : uniquement les produits DE la
// famille, et rang CERTAIN sinon rien.

const { legalTier, denominationLegale } = require('./rules.js');

let pass = 0;
const echecs = [];
function ok(nom, cond, detail = '') {
  if (cond) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}
const GLACES = ['en:desserts', 'en:frozen-foods', 'en:frozen-desserts', 'en:ice-creams-and-sorbets', 'en:ice-creams'];
// Beaucoup de fiches ne portent QUE le tag mixte : la famille doit rester
// atteignable sans `en:ice-creams`.
const MIXTE = ['en:ice-creams-and-sorbets'];

function tier(nom, tags = GLACES, ingr = 'lait, sucre, creme') {
  return legalTier(nom, ingr, tags);
}
const rang = (nom, tags, ingr) => { const t = tier(nom, tags, ingr); return t ? t.ici : null; };
const famille = (nom, tags) => { const t = tier(nom, tags); return t ? t.famille : null; };
const attendu = (label, nom, r, tags = GLACES) =>
  ok(label, rang(nom, tags) === r, `obtenu ${rang(nom, tags)} / attendu ${r}`);

console.log("--- GLACE : glace à l'eau · glace · glace au lait · crème glacée ---");
attendu('glace nue', 'Glace', 1);
attendu('glace + parfum', 'Glace Vanille Bourbon', 1);
attendu('marque devant', "CARTE D'OR Glace Chocolat Noir 900ml", 1);
attendu('format derrière', 'MAGNUM Glace Bâtonnet Amande 8x110ml', 1);
attendu('pluriel', 'Glaces chocolat blanc et caramel pécan', 1);
attendu('glace au lait', 'Glace au lait vanille', 2);
attendu('crème glacée', 'Crème glacée vanille', 3);
attendu('crème glacée dans un nom long', "CARTE D'OR Glace Crème Glacée Vanille de Madagascar 900ml", 3);
// Vu dans la base : la finale du participe n'est pas fiable, on ne l'exige pas.
attendu('« Creme glacé » (faute de frappe)', 'Creme glacé caramel', 3);
attendu("glace à l'eau", "Glace à l'eau citron", 0);
attendu('glaçon', 'Glaçon fraise', 0);

console.log('--- GLACE : le piège de l\'ADJECTIF (normalize efface l\'accent) ---');
// « glacé » qualifie un support ou une barre : ce n'est pas la dénomination.
// Sans ce garde-fou, l'app annonçait à un Mars glacé qu'il ne garantit aucune
// matière grasse laitière.
ok('Mars glacé', rang('Mars glacé') === null, String(rang('Mars glacé')));
ok('Twix glacé', rang('Twix glacé x6') === null);
ok('Snickers glacé', rang('Snickers glacé white x6') === null);
ok('cônes glacés', rang('Cônes glacés, café et pépites au café 6 x 71 g') === null);
ok('bâtonnets glacés', rang("BOÎTE DE 4 BÂTONNETS GLACÉS L'ORIGINAL LOTUS BISCOFF") === null);
ok('barres glacées', rang('Bounty Barres Glacees Ice Cream') === null);
ok('café glacé', rang('Café glacé vanille') === null);

console.log('--- GLACE : ce dont on ne peut RIEN dire ---');
// « Swedish Glace » est une marque : le mot y est un nom propre.
ok('marque « Swedish Glace »', rang('Swedish Glace dairy-free smooth Vanilla') === null);
// La glace aux œufs est plus exigeante que la crème glacée sur un AUTRE
// critère (7 % de jaune d'œuf) : aucune place sûre sur cette échelle.
ok('glace aux œufs', rang('Glace aux oeufs vanille') === null);
// ⚠️ « ice cream » n'est PAS « crème glacée » : au Royaume-Uni la mention
// autorise la graisse végétale. Lui prêter la garantie française serait une
// fausse promesse · mesuré : 51 fiches anglaises sur 607, UK, Australie, NZ.
ok('« Vanilla Ice Cream »', rang('Vanilla Ice Cream') === null);
ok('« Traditional Dairy Ice Cream »', rang('Traditional Dairy Ice Cream') === null);
ok('« Mars ice cream »', rang('Mars ice cream x6') === null);
ok('nom sans dénomination', rang('Magnum Amande') === null);
ok('nom sans dénomination (2)', rang('Extrême original - vanille pépites') === null);
ok('hors famille', rang('Glace Vanille', ['en:biscuits']) === null);
// ⚠️ Trouvé sur un vrai produit : les thés glacés portent des tags qui se
// TERMINENT par le mot de la famille (`fr:the-vert-glace`, `en:thes-glaces`)
// sans en être · la leçon `en:sardines-in-olive-oil` sous une autre forme.
ok('thé glacé (tag fr:the-vert-glace)',
  rang('Thé vert glacé', ['en:beverages', 'en:iced-teas', 'fr:the-vert-glace']) === null,
  String(rang('Thé vert glacé', ['en:beverages', 'en:iced-teas', 'fr:the-vert-glace'])));
ok('thés glacés (tag en:thes-glaces)',
  rang('Thé glacé pêche', ['en:beverages', 'en:thes-glaces']) === null);

console.log('--- SORBET : sorbet · sorbet plein fruit ---');
attendu('sorbet', 'Sorbet Citron 900ml', 0);
attendu('sorbet pluriel', 'Sorbets Citrons Framboises', 0);
attendu('marque devant', 'Oasis sorbet Tropical', 0);
attendu('sorbet plein fruit', 'Sorbet plein fruit Mangue 500G/750ml 2022', 1);
ok('famille SORBET nommée', famille('Sorbet Citron') === 'Sorbet', famille('Sorbet Citron'));
ok('famille GLACE nommée', famille('Glace Vanille') === 'Glace', famille('Glace Vanille'));

console.log('--- DEUX échelles sur le même rayon ---');
// Régression visée : tant que legalTier abandonnait au premier `null`, la
// famille Sorbet (testée en premier) faisait taire la famille Glace.
ok('une glace n\'est pas jugée sur l\'échelle des sorbets',
  famille('Glace Vanille Bourbon', MIXTE) === 'Glace', String(famille('Glace Vanille Bourbon', MIXTE)));
ok('un sorbet reste un sorbet', famille('Sorbet Fraise', MIXTE) === 'Sorbet');
ok('tag mixte seul : la famille reste atteignable', rang('Crème glacée vanille', MIXTE) === 3);

console.log('--- Les familles sont bien décrites ---');
const g = tier('Crème glacée vanille');
ok('glace : 4 rangs', g && g.rangs.length === 4, g && JSON.stringify(g.rangs));
ok('glace : au sommet', g && g.sommet === true);
ok('glace : explication non vide', g && g.expl && g.expl.length > 20, g && g.expl);
ok('glace : aucune citation légale', g && !/reglement|directive|decret|code des|\(UE\)/i.test(g.expl), g && g.expl);
const gb = tier('Glace Vanille');
ok('glace : le rang « glace » dit l\'essentiel', gb && /laitière/i.test(gb.expl), gb && gb.expl);
ok('glace : pas au sommet', gb && gb.sommet === false);
const s = tier('Sorbet plein fruit Mangue');
ok('sorbet : 2 rangs', s && s.rangs.length === 2, s && JSON.stringify(s.rangs));
ok('sorbet : au sommet', s && s.sommet === true);
ok('sorbet : aucune citation légale', s && !/reglement|directive|decret|code des|\(UE\)/i.test(s.expl), s && s.expl);

console.log('--- LA DÉNOMINATION LÉGALE PRIME SUR LE NOM COMMERCIAL ---');
// Mesuré sur 162 desserts glacés où les deux noms donnent un rang : ils se
// CONTREDISENT 36 fois (22,2 %). Le nom commercial abrège, la dénomination
// engage. Lire le premier faisait annoncer « aucune matière grasse laitière
// exigée » à des produits légalement vendus comme crème glacée.
const legal = (nom, generic, tags = GLACES) => {
  const t = legalTier(nom, 'lait, sucre', tags, generic);
  return t ? `${t.famille}:${t.rangs[t.ici]}` : null;
};
ok('Carte d\'Or : « Glace » au nom, « Crème glacée » en dénomination',
  legal("CARTE D'OR Glace Chocolat Noir 900ml", 'Crème glacée chocolat noir (avec 2% de chocolat noir)') === 'Glace:crème glacée',
  String(legal("CARTE D'OR Glace Chocolat Noir 900ml", 'Crème glacée chocolat noir (avec 2% de chocolat noir)')));
ok('un nom muet que la dénomination fait parler',
  legal('Mars glacé', 'Crème glacée nappée de caramel 16%, enrobage cacao 32%') === 'Glace:crème glacée',
  String(legal('Mars glacé', 'Crème glacée nappée de caramel 16%, enrobage cacao 32%')));
ok('la dénomination peut aussi RABAISSER le rang',
  legal('Crème glacée pistache', 'Glace pistache avec pistaches hachées grillées') === 'Glace:glace',
  String(legal('Crème glacée pistache', 'Glace pistache avec pistaches hachées grillées')));
ok('sorbet relevé en plein fruit',
  legal('Sorbet Citron 900ml', 'Sorbet plein fruit citron de Sicile, aromatisé') === 'Sorbet:sorbet plein fruit');
// ⚠️ La dénomination mêle le produit ET sa composition. Sans couper à la tête
// de phrase, « Glace façon yaourt, avec sorbet mangue » partait sur l'échelle
// des sorbets alors que c'est une glace.
ok('la composition qui suit ne détourne pas la famille',
  legal("Carte D'Or Façon Yaourt", 'Glace façon yaourt, avec sorbet mangue-fruit de la passion') === 'Glace:glace',
  String(legal("Carte D'Or Façon Yaourt", 'Glace façon yaourt, avec sorbet mangue-fruit de la passion')));
ok('la parenthèse ne coupe pas la dénomination',
  denominationLegale('Crème glacée chocolat noir (avec 2% de chocolat) avec des morceaux')
    === 'Crème glacée chocolat noir (avec 2% de chocolat)',
  denominationLegale('Crème glacée chocolat noir (avec 2% de chocolat) avec des morceaux'));
ok('la première phrase suffit',
  denominationLegale('Deux textures de crème glacée dans un même pot. Crème glacée vanille')
    === 'Deux textures de crème glacée dans un même pot');
ok('dénomination vide : on retombe sur le nom commercial',
  legal('Sorbet Fraise', '') === 'Sorbet:sorbet');
ok('dénomination muette : on retombe sur le nom commercial',
  legal('Sorbet Fraise', 'Dessert glacé aux fruits rouges') === 'Sorbet:sorbet');
ok('hors famille, la dénomination ne sauve rien',
  legal('Mars glacé', 'Crème glacée nappée de caramel', ['en:biscuits']) === null);

console.log('--- Chaque rang porte son explication (marches cliquables) ---');
const t4 = tier('Glace Vanille');
ok('4 explications servies', t4 && Array.isArray(t4.expls) && t4.expls.length === 4,
  t4 && JSON.stringify((t4.expls || []).length));
ok('chacune est non vide', t4 && t4.expls.every((e) => e && e.length > 20));
ok('celle du rang atteint est bien expl', t4 && t4.expls[t4.ici] === t4.expl);
const t2 = tier('Sorbet Citron');
ok('2 explications pour le sorbet', t2 && t2.expls.length === 2);

console.log('--- Non-régression : les 5 familles déjà livrées ---');
ok('jus intact', legalTier('Pur jus orange', 'jus', ['en:juices']) !== null);
ok('huile intacte', legalTier("Huile d'olive vierge extra", 'huile', ['en:olive-oils']) !== null);
ok('confiture intacte', legalTier('Confiture extra de fraise', 'fraises', ['en:jams']) !== null);
ok('jambon intact', legalTier('Jambon cuit superieur', 'jambon', ['en:hams']) !== null);
ok('poudre intacte', legalTier('Chocolat en poudre', 'cacao', ['en:cocoa-and-chocolate-powders']) !== null);
ok("sardines à l'huile toujours écartées",
  legalTier("Sardines a l'huile d'olive", 'sardines', ['en:sardines-in-olive-oil']) === null);
ok('produit sans catégorie', legalTier('Glace Vanille', 'lait', []) === null);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
