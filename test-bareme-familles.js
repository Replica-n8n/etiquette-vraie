// Barème légal : familles JAMBON et POUDRE CHOCOLATÉE.
// Lancer :  node test-bareme-familles.js
//
// Chaque rang a été mesuré sur 600 produits réels avant d'être codé :
//   jambon            35,2 % du rayon placé, et le partage est net (87 « cuit »
//                     contre 122 « supérieur »)
//   poudre chocolatée 19,3 %, mais le partage sépare Nesquik du vrai chocolat
//                     en poudre et du cacao pur
// Les deux règles dures du barème s'appliquent : uniquement les produits DE la
// famille, et rang CERTAIN sinon rien.

const { legalTier } = require('./rules.js');

let pass = 0;
const echecs = [];
function ok(nom, cond, detail = '') {
  if (cond) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}
const JAMBON = ['en:meats', 'en:prepared-meats', 'en:hams', 'en:white-hams'];
const POUDRE = ['en:cocoa-and-its-products', 'en:cocoa-and-chocolate-powders'];

function rang(nom, tags, ingr = 'ingredients') {
  const t = legalTier(nom, ingr, tags);
  return t ? t.ici : null;
}
const attendu = (label, nom, tags, r) => ok(label, rang(nom, tags) === r, `obtenu ${rang(nom, tags)} / attendu ${r}`);

console.log('--- JAMBON : cuit · choix · supérieur ---');
attendu('jambon cuit', 'Jambon cuit', JAMBON, 0);
attendu('jambon blanc', 'Jambon blanc 4 tranches', JAMBON, 0);
attendu('jambon cuit choix', 'Jambon cuit choix 5 tranches', JAMBON, 1);
attendu('jambon cuit supérieur', 'Jambon cuit superieur avec couenne', JAMBON, 2);
attendu('« Le Supérieur »', 'Le Superieur Sans Couenne 2tr', JAMBON, 2);
attendu('supérieur sans le mot cuit', 'Jambon superieur 20 tranches VPF', JAMBON, 2);

console.log('--- JAMBON : ce qui n\'est pas un jambon CUIT ---');
// Le jambon sec est une autre famille, avec d'autres règles : on se tait.
ok('jambon sec', rang('Jambon sec de pays', JAMBON) === null, String(rang('Jambon sec de pays', JAMBON)));
ok('serrano', rang('Jamon serrano reserva', JAMBON) === null);
ok('parme', rang('Jambon de Parme AOP', JAMBON) === null);
ok('cru', rang('Jambon cru italien', JAMBON) === null);
ok('fumé', rang('Jambon fume a l ancienne', JAMBON) === null);
ok('nom sans dénomination', rang('Le Bon Paris 4 tranches fines', JAMBON) === null);
ok('hors famille', rang('Jambon cuit superieur', ['en:pizzas']) === null);

console.log('--- POUDRE CHOCOLATÉE : poudre sucrée · cacao sucré · chocolat en poudre · cacao pur ---');
attendu('poudre cacaotée (Nesquik)', 'NESQUIK Poudre Cacaotee', POUDRE, 0);
attendu('poudre pour boisson', 'Poudre pour boisson cacaotee', POUDRE, 0);
attendu('cacao sucré', 'Cacao sucre en poudre', POUDRE, 1);
attendu('chocolat en poudre', 'Chocolat en poudre 32%', POUDRE, 2);
attendu('chocolate powder (EN)', 'Instant chocolate powder', POUDRE, 2);
attendu('cacao non sucré', 'Cacao non sucre', POUDRE, 3);
attendu('cocoa powder (EN)', 'Organic cocoa powder', POUDRE, 3);
attendu('cacao maigre', 'Cacao maigre en poudre', POUDRE, 3);

console.log('--- POUDRE : rang incertain, on se tait ---');
ok('« Cacao » seul', rang('Cacao', POUDRE) === null, String(rang('Cacao', POUDRE)));
ok('marque seule', rang('Goodycao', POUDRE) === null);
ok('allemand', rang('Kakao', POUDRE) === null);
ok('hors famille', rang('Chocolat en poudre', ['en:biscuits']) === null);

console.log('--- La famille est bien décrite ---');
const j = legalTier('Jambon cuit superieur', 'jambon de porc, sel', JAMBON);
ok('jambon : famille nommée', j && j.famille === 'Jambon cuit', j && j.famille);
ok('jambon : 3 rangs', j && j.rangs.length === 3, j && JSON.stringify(j.rangs));
ok('jambon : au sommet', j && j.sommet === true);
ok('jambon : explication non vide', j && j.expl && j.expl.length > 20, j && j.expl);
ok('jambon : aucune citation légale', j && !/reglement|directive|decret|\(UE\)/i.test(j.expl), j && j.expl);
const c = legalTier('Chocolat en poudre', 'sucre, cacao maigre 32%', POUDRE);
ok('poudre : famille nommée', c && c.famille === 'Poudre chocolatée', c && c.famille);
ok('poudre : 4 rangs', c && c.rangs.length === 4, c && JSON.stringify(c.rangs));

console.log('--- Non-régression : les 3 familles déjà livrées ---');
ok('jus intact', legalTier('Pur jus orange', 'jus', ['en:juices']) !== null);
ok('huile intacte', legalTier("Huile d'olive vierge extra", 'huile', ['en:olive-oils']) !== null);
ok('confiture intacte', legalTier('Confiture extra de fraise', 'fraises', ['en:jams']) !== null);
ok('sardines à l\'huile toujours écartées',
  legalTier("Sardines a l'huile d'olive", 'sardines', ['en:sardines-in-olive-oil']) === null);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
