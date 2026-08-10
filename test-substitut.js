// Nommer le substitut.
// Lancer :  node test-substitut.js
//
// « Filet de cabillaud » composé de pangasius affichait :
//     "cabillaud" absent - seulement un arôme
// Il n'y a AUCUN arôme dans cette liste. Le substitut est en première position,
// l'app l'a sous les yeux, et elle raconte une histoire d'arôme. C'est le plus
// gros manque du moteur : il sait dire ce qui manque, jamais ce qu'on a mis à
// la place - alors que c'est précisément la question de l'acheteuse.
//
// Trois libellés, à ne pas confondre :
//   - un aliment de la même famille est présent  -> « absent, remplacé par X »
//   - le mot n'apparaît que dans un arôme        -> « seulement un arôme »
//   - rien de tout ça                            -> « absent de la liste »

const { detectVerdict, findSubstitute, normalize } = require('./rules.js');

let pass = 0;
const echecs = [];
function ok(nom, cond, detail = '') {
  if (cond) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}

const sub = (mot, liste) => findSubstitute(mot, normalize(liste));

console.log('--- Le substitut est trouvé, et c\'est le bon ---');
ok('pangasius pour cabillaud', sub('cabillaud', 'pangasius, eau, sel') === 'pangasius', sub('cabillaud', 'pangasius, eau, sel'));
ok('cheval pour boeuf', sub('boeuf', 'pates, viande de cheval, tomate') === 'cheval', sub('boeuf', 'pates, viande de cheval, tomate'));
ok('surimi pour crabe', sub('crabe', 'surimi, mayonnaise, sel') === 'surimi', sub('crabe', 'surimi, mayonnaise, sel'));
ok('colin pour cabillaud', sub('cabillaud', 'chapelure, colin 40%, huile') === 'colin', sub('cabillaud', 'chapelure, colin 40%, huile'));
ok('cacahuète pour noisette', sub('noisette', 'sucre, huile de palme, cacahuetes') === 'cacahuete', sub('noisette', 'sucre, huile de palme, cacahuetes'));
ok('dinde pour poulet', sub('poulet', 'viande de dinde, eau, sel') === 'dinde', sub('poulet', 'viande de dinde, eau, sel'));
ok('tilapia pour dorade', sub('dorade', 'tilapia, eau') === 'tilapia', sub('dorade', 'tilapia, eau'));
// Le PREMIER de la liste gagne : c'est celui qui pèse le plus (art. 18).
ok('le premier ingrédient l\'emporte', sub('cabillaud', 'pangasius, colin, eau') === 'pangasius', sub('cabillaud', 'pangasius, colin, eau'));

console.log('--- Ne rien inventer ---');
ok('aucune famille : pas de substitut', sub('fraise', 'farine, sucre, beurre') === null, sub('fraise', 'farine, sucre, beurre'));
ok('famille connue mais personne dedans', sub('cabillaud', 'chapelure, huile, farine') === null, sub('cabillaud', 'chapelure, huile, farine'));
// Un arôme n'est pas un substitut : personne n'a mis du saumon à la place.
ok('un arôme n\'est pas un substitut', sub('cabillaud', 'eau, amidon, arome de saumon') === null, sub('cabillaud', 'eau, amidon, arome de saumon'));
ok('un arôme (EN) non plus', sub('crabe', 'water, starch, crab flavour') === null, sub('crabe', 'water, starch, crab flavour'));
// On ne se remplace pas soi-même.
ok('le mot lui-même n\'est pas son substitut', sub('cabillaud', 'cabillaud, eau, sel') === null, sub('cabillaud', 'cabillaud, eau, sel'));
// Les familles ne se mélangent pas : un poisson ne remplace pas une noisette.
ok('pas de mélange entre familles', sub('noisette', 'colin, eau, sel') === null, sub('noisette', 'colin, eau, sel'));
ok('liste vide', sub('cabillaud', '') === null);

console.log('--- Le même poisson sous deux noms de vente ---');
// TROUVÉ EN VRAI le 2026-08-10, sur trois produits de marque. « Cabillaud » et
// « morue » sont le MÊME poisson : frais d'un côté, salé ou séché de l'autre.
// Déclarés séparément, ils devenaient substituts l'un de l'autre, et l'app
// accusait « Filets de morue salée » dont la liste dit « Cabillaud » - la vérité.
const m1 = detectVerdict('Filets de morue salee', 'cabillaud (gadus morhua), sel');
ok('morue composée de cabillaud : honnête', m1.verdict === 'clean', `${m1.verdict} — ${m1.headline}`);
const m2 = detectVerdict('Filet de cabillaud', 'morue salee, eau');
ok('cabillaud composé de morue : honnête', m2.verdict === 'clean', `${m2.verdict} — ${m2.headline}`);
ok('cabillaud ne remplace pas la morue', sub('morue', 'cabillaud, eau, sel') === null, sub('morue', 'cabillaud, eau, sel'));
// ... et la vraie substitution reste attrapée.
const m3 = detectVerdict('Filet de morue', 'pangasius, eau, sel');
ok('morue composée de pangasius : attrapée', /remplacé par pangasius/.test(m3.headline), m3.headline);

console.log('--- Un nom propre n\'est pas un aliment ---');
// « Solène » (marque de céréales) était lu comme « sole » : nameFormPattern
// collait les terminaisons -ne/-nee à TOUS les mots, y compris ceux qui
// finissent déjà par une voyelle. Le doublement de consonne n'a de sens
// qu'après une consonne (citron -> citronné).
const s1 = detectVerdict('Solene cereales poulet a l italienne', 'ble, poulet, tomate, sel');
ok('Solène n\'est pas de la sole', !/sole/i.test(s1.headline || ''), s1.headline);
ok('Solène : le poulet est bien vu', s1.verdict === 'clean', `${s1.verdict} — ${s1.headline}`);

console.log('--- Le verdict dit enfin ce qu\'il y a à la place ---');
const v1 = detectVerdict('Filet de cabillaud', 'pangasius, eau, sel, stabilisant');
ok('cabillaud/pangasius : trompeur', v1.verdict === 'misleading', `verdict=${v1.verdict}`);
ok('le substitut est nommé', /pangasius/i.test(v1.headline), v1.headline);
// LE BUG D'ORIGINE : il n'y a aucun arôme dans cette liste.
ok('plus d\'arôme inventé', !/arome|arôme/i.test(v1.headline), v1.headline);
ok('le détail porte le substitut', v1.detail && /remplac/i.test(v1.detail.compareReal || ''), JSON.stringify(v1.detail));

const v2 = detectVerdict('Lasagnes au boeuf', 'pates, viande de cheval, sauce tomate');
ok('lasagnes : cheval nommé', /cheval/i.test(v2.headline), v2.headline);
ok('lasagnes : pas d\'arôme inventé', !/arome|arôme/i.test(v2.headline), v2.headline);

const v3 = detectVerdict('Salade de crabe', 'surimi, mayonnaise, sel');
ok('salade de crabe : surimi nommé', /surimi/i.test(v3.headline), v3.headline);

console.log('--- Absent sans substitut : le dire sans mentir ---');
const v4 = detectVerdict('Biscuit fraise', 'farine, sucre, beurre');
ok('absent : trompeur', v4.verdict === 'misleading', `verdict=${v4.verdict}`);
ok('absent : pas d\'arôme inventé', !/arome|arôme/i.test(v4.headline), v4.headline);
ok('absent : le mot « absent » est là', /absent/i.test(v4.headline), v4.headline);

console.log('--- L\'arôme reste l\'arôme (non-régression) ---');
const v5 = detectVerdict('Biscuit fraise', 'farine, sucre, arome fraise');
ok('arôme réel : libellé conservé', /arome|arôme/i.test(v5.headline), v5.headline);
ok('arôme réel : trompeur', v5.verdict === 'misleading', `verdict=${v5.verdict}`);

const v6 = detectVerdict('Yaourt saveur fraise', 'lait, sucre, arome');
ok('réserve annoncée : reste « À vérifier »', v6.verdict === 'warning', `verdict=${v6.verdict}`);

console.log('--- Plusieurs aliments manquants ---');
const v7 = detectVerdict('Terrine cabillaud et crabe', 'pangasius, surimi, eau');
ok('deux substituts : trompeur', v7.verdict === 'misleading', `verdict=${v7.verdict}`);
ok('deux substituts : au moins un nommé', /pangasius|surimi/i.test(v7.headline), v7.headline);
ok('deux substituts : pas d\'arôme inventé', !/arome|arôme/i.test(v7.headline), v7.headline);

const v8 = detectVerdict('Biscuit fraise et framboise', 'farine, arome fraise, arome framboise');
ok('deux arômes : libellé arôme conservé', /arome|arôme/i.test(v8.headline), v8.headline);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
