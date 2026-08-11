// Barème légal : famille CONFITURE.
// Lancer :  node test-bareme-confiture.js
//
// Cas qui a motivé la famille : « Confiture artisanale de fraises », sirop de
// glucose-fructose en tête de liste, 20 % de fraises, gélifiant, colorant.
// Verdict de l'app : Conforme. Le nom ne ment sur aucun aliment - la fraise est
// bien là - mais le mot « confiture » est une dénomination protégée, et le
// produit se situe quelque part sur une échelle que l'acheteuse ne connaît pas.
//
// Les DEUX RÈGLES DURES du barème s'appliquent ici comme ailleurs :
//   1. seulement les produits DE la famille (une compote n'est pas une confiture)
//   2. le rang doit être CERTAIN, sinon on n'affiche rien

const { legalTier } = require('./rules.js');

let pass = 0;
const echecs = [];
function ok(nom, cond, detail = '') {
  if (cond) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}

const JAM = ['en:plant-based-foods', 'en:spreads', 'en:jams'];
const MARM = ['en:spreads', 'en:jams', 'en:citrus-jams', 'en:marmalades'];

// Rang attendu, en une ligne : le helper de ce fichier renvoie l'indice.
function attendu(label, nom, tags, r) {
  ok(label, rang(nom, tags) === r, `obtenu ${rang(nom, tags)} / attendu ${r}`);
}

function rang(nom, tags = JAM, ingr = 'fruits, sucre') {
  const t = legalTier(nom, ingr, tags);
  return t ? t.ici : null;
}

console.log('--- Les quatre rangs ---');
ok('préparation de fruits = rang 0', rang('Preparation de fruits fraise') === 0, String(rang('Preparation de fruits fraise')));
ok('spécialité de fruits = rang 0', rang('Specialite de fruits abricot') === 0, String(rang('Specialite de fruits abricot')));
ok('marmelade = rang 1', rang("Marmelade d'oranges ameres", MARM) === 1, String(rang("Marmelade d'oranges ameres", MARM)));
ok('marmalade (EN) = rang 1', rang('Oxford Marmalade', MARM) === 1, String(rang('Oxford Marmalade', MARM)));
// L'agrume peut n'être visible que dans la catégorie.
ok('marmelade sans agrume au nom mais tag citrus', rang('Marmelade maison', MARM) === 1, String(rang('Marmelade maison', MARM)));
// ⚠️ En allemand « Marmelade » = confiture, pas marmelade d'agrumes. Vu en vrai
// dans la base : « Marmelade Erdbeere » (fraise). Lui donner le seuil des
// agrumes serait un contresens - et il n'a pas de tag citrus.
ok('Marmelade Erdbeere (fraise) : on se tait',
  rang('Marmelade Erdbeere', ['en:spreads', 'en:jams', 'en:marmalades']) === null,
  String(rang('Marmelade Erdbeere', ['en:spreads', 'en:jams', 'en:marmalades'])));
ok('confiture = rang 2', rang('Confiture de fraise') === 2, String(rang('Confiture de fraise')));
ok('jam (EN) = rang 2', rang('Strawberry jam') === 2, String(rang('Strawberry jam')));
ok('confiture extra = rang 3', rang('Confiture extra mirabelle') === 3, String(rang('Confiture extra mirabelle')));
ok('extra jam (EN) = rang 3', rang('Extra jam raspberry') === 3, String(rang('Extra jam raspberry')));
ok('extra après le fruit', rang('Confiture de fraises extra') === 3, String(rang('Confiture de fraises extra')));

console.log('--- La famille est complète et bien décrite ---');
const t = legalTier('Confiture de fraise', 'fraises, sucre', JAM);
ok('famille nommée', t && t.famille === 'Confiture', t && t.famille);
ok('quatre rangs', t && t.rangs.length === 4, t && JSON.stringify(t.rangs));
ok('une explication non vide', t && typeof t.expl === 'string' && t.expl.length > 20, t && t.expl);
ok("« confiture » n'est pas le sommet", t && t.sommet === false, t && String(t.sommet));
const t3 = legalTier('Confiture extra de fraise', 'fraises, sucre', JAM);
ok('« extra » est le sommet', t3 && t3.sommet === true, t3 && String(t3.sommet));
// Décision du projet : aucune citation de texte réglementaire à l'écran.
ok('aucune citation légale affichée',
  t && !/reglement|règlement|directive|decret|décret|\(UE\)|CE\b/i.test(t.expl), t && t.expl);

console.log('--- La directive vaut dans toute l\'Union, dans toutes les langues ---');
// Mesuré sur 800 confitures : 60 portaient « extra » sans recevoir de rang,
// TOUTES en langue étrangère. Les seuils sont les mêmes partout en Europe.
attendu('confettura extra (IT)', 'Confettura extra di albicocche', JAM, 3);
attendu('Konfitüre extra (DE)', 'Konfiture extra Sauerkirsche', JAM, 3);
attendu('confitura extra (ES/CA)', 'Confitura Extra De Pressec Hero', JAM, 3);
attendu('doce extra (PT)', 'Doce Extra de Ananas dos Acores', JAM, 3);
attendu('confettura simple', 'Confettura di fragole', JAM, 2);
// ⚠️ « mermelada », « marmellata » et « Marmelade » sont les mots RÉSERVÉS aux
// agrumes, employés à tort et à travers dans le commerce. Même garde-fou que
// pour l'allemand : sans agrume visible, on se tait.
ok('mermelada de fresa : on se tait',
  rang('Mermelada extra de fresa', JAM) === null, String(rang('Mermelada extra de fresa', JAM)));
attendu('mermelada de naranja', 'Mermelada extra de naranja', MARM, 1);
attendu('marmellata di arance', 'Marmellata di arance', MARM, 1);

console.log('--- « Conserve » n\'est pas une dénomination ---');
// 3045320512823, Bonne Maman Black Cherry Conserve : OFF le classe bien en
// en:jams, mais « conserve » est un mot de commerce britannique, absent des
// dénominations que la réglementation définit. On ne peut en déduire ni 35 %
// ni 45 %. Vu sur 2 produits pour 800 : le silence est la bonne réponse.
ok('conserve britannique', rang('Bonne Maman Black Cherry Conserve 370G', JAM) === null,
  String(rang('Bonne Maman Black Cherry Conserve 370G', JAM)));
ok('preserve', rang('Blackberry Preserve', JAM) === null);

console.log('--- Hors famille : ne rien afficher ---');
ok('compote', rang('Compote de pommes', ['en:compotes', 'en:desserts']) === null);
ok('miel', rang('Miel de lavande', ['en:honeys']) === null);
ok('pâte à tartiner', rang('Pate a tartiner chocolat', ['en:spreads', 'en:cocoa-and-hazelnuts-spreads']) === null);
ok('aucune catégorie', legalTier('Confiture de fraise', 'fraises, sucre', []) === null);
// ⚠️ Le tag doit être ANCRÉ : « en:fruit-and-vegetable-preserves » contient
// « preserves », pas « jams », et décrit une famille bien plus large.
ok('conserve de fruits et légumes', rang('Bocal de fruits', ['en:fruit-and-vegetable-preserves']) === null);

console.log('--- Rang incertain : se taire ---');
// La majorité du rayon : le nom ne porte aucune dénomination.
ok('nom sans dénomination', rang('Fruits des bois') === null, String(rang('Fruits des bois')));
ok('nom sans dénomination (2)', rang('Douceur du verger 3 agrumes') === null);
ok('gelée : hors de cette échelle', rang('Gelee de groseille') === null, String(rang('Gelee de groseille')));
ok('langue non couverte', rang('Mermelada extra frambuesa') === null, String(rang('Mermelada extra frambuesa')));
ok('Fruchtaufstrich (allemand)', rang('Bio Fruchtaufstrich Erdbeere') === null);

console.log('--- Les fausses confitures : ce ne sont pas des fruits ---');
// « Confiture d'oignons » et « confiture de lait » portent le mot sans être la
// chose : les minima de fruits ne veulent rien dire pour elles. Les placer sur
// l'échelle donnerait une note à un produit que la loi ne juge pas ainsi.
ok("confiture d'oignons", rang("Confiture d'oignons doux des Cevennes") === null, String(rang("Confiture d'oignons doux des Cevennes")));
ok('confiture de lait', rang('Confiture de lait') === null, String(rang('Confiture de lait')));
ok('confiture de tomates vertes', rang('Confiture de tomates vertes') === null);
ok('confiture de piment', rang('Confiture de piment doux') === null);
ok('onion jam (EN)', rang('Red onion jam') === null);
// ... mais une vraie confiture de fruits reste jugée, même avec un légume-fruit.
ok('pomme potiron : reste une confiture', rang('Confiture Pomme Potiron Bio') === 2, String(rang('Confiture Pomme Potiron Bio')));

console.log('--- Non-régression : les deux familles déjà livrées ---');
ok('jus : pur jus intact', legalTier('Pur jus orange', 'jus orange', ['en:juices']) !== null);
ok('huile : vierge extra intact', legalTier("Huile d'olive vierge extra", 'huile', ['en:olive-oils']) !== null);
ok('sardines à l\'huile d\'olive : toujours écartées',
  legalTier("Sardines a l'huile d'olive", 'sardines, huile', ['en:sardines-in-olive-oil']) === null);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
