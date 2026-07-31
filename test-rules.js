// Batterie de non-régression du moteur de détection.
// Lancer :  node test-rules.js
//
// Chaque ligne est un piège réel rencontré sur un emballage. Toute nouvelle
// tromperie découverte doit venir grossir cette liste AVANT d'être corrigée,
// pour qu'elle ne puisse plus repasser inaperçue.
//
// Familles couvertes :
//  1. marqueurs de saveur dans les INGRÉDIENTS (arôme, à saveur de, imitation,
//     simili-, flavoured...) - formules exigées par l'ACIA quand l'aliment
//     mis en avant n'est pas réellement présent
//  2. réserves dans le NOM (chocolaté, vanillé, chocolatey, imitation...)
//     -> le fabricant a prévenu : "À vérifier", pas "Trompeur"
//  3. quantités en trace (framboise 2%) - le cas "très faible concentration"
//  4. non-régression sur de vrais produits honnêtes
//  5. pièges à faux positifs (herbes aromatiques, catégories de produit)

const { detectVerdict } = require('./rules.js');
const T = [
 // ---- FAMILLE 1 : marqueurs de saveur DANS LES INGRÉDIENTS ----
 ['arôme','Biscuit fraise','farine, sucre, arome fraise','misleading'],
 ['arôme naturel','Biscuit fraise','farine, arome naturel de fraise','misleading'],
 ['aromatisé','Biscuit fraise','farine, preparation aromatisee fraise','misleading'],
 ['saveur de (ACIA)','Barre chocolat','avoine, morceaux a saveur de chocolat','misleading'],
 ['goût','Barre chocolat','avoine, pepites gout chocolat','misleading'],
 ['parfum','Yaourt citron','lait, preparation parfum citron','misleading'],
 ['essence','Gateau vanille','farine, essence de vanille','misleading'],
 ['artificiel','Bonbon fraise','sucre, arome artificiel de fraise','misleading'],
 ['imitation','Pizza crabe','pate, imitation de crabe','misleading'],
 ['simili (ACIA)','Pizza crabe','pate, simili-crabe, fromage','misleading'],
 ['flavoured (EN)','Chocolate bar','oats, chocolate flavoured chunks','misleading'],
 ['flavour (EN)','Cheese chips','potato, cheese flavour powder','misleading'],
 ['beurre réel','Beurre doux','creme pasteurisee, sel','clean'],
 ['jambon réel','Jambon de Paris','jambon de porc, sel, eau','clean'],
 ['chips fromage réel','Chips au fromage','pomme de terre, fromage en poudre, sel','clean'],
 ['poulet catégorie','Poulet roti','poulet, sel, epices','clean'],
 ['crème dessert','Creme dessert vanille','lait, sucre, amidon, vanille','clean'],
 // ---- FAMILLE 2 : réserve DANS LE NOM -> "À vérifier" ----
 ['chocolaté (FR)','Barre CHOCOLATÉE','avoine, morceaux a saveur de chocolat','warning'],
 ['vanillé','Creme vanillée','lait, sucre, arome vanille','warning'],
 ['citronné','Biscuit citronné','farine, arome citron','warning'],
 ['praliné','Barre pralinée','sucre, arome noisette','warning'],
 ['beurré','Gateau beurré','farine, arome beurre','warning'],
 ['saveur X','Yaourt saveur fraise','lait, sucre, arome','warning'],
 ['goût X','Chips goût bacon','pomme de terre, arome bacon','warning'],
 ['chocolatey (EN)','Chocolatey Cranberry Mix','peanuts, cranberries, chocolate flavoured chunks','warning'],
 ['fruity (vague, hors périmètre)','Fruity Loops','corn, sugar, natural flavour','clean'],
 ['flavoured (EN)','Strawberry Flavoured Milk','milk, sugar, strawberry flavour','warning'],
 ['façon','Terrine façon grand-mere','porc, sel','clean'],
 ['type','Fromage type feta','lait, sel, ferments','clean'],
 ['REGRESSION Fromage Blanc','Fromage Blanc','lait ecreme pasteurise, creme pasteurises, ferments lactiques','clean'],
 ['imitation (nom)','Imitation crabe','surimi, amidon, arome de crabe','warning'],
 // ---- FAMILLE 3 : quantité en trace -> "À vérifier" ----
 ['2% framboise','Barre framboise','avoine, sucre, framboise 2%, huile','warning'],
 ['1,5% citron','Tarte citron','farine, oeufs, citron 1,5%','warning'],
 ['% avant le mot','Yaourt fraise','lait, 3% de fraise, sucre','warning'],
 ['12% = correct','Biscuit noisette','farine, noisettes 12%, sucre','clean'],
 // ---- FAMILLE 4 : non-régression (vrais produits honnêtes) ----
 ['fruit réel',"Jus d'orange","jus d'orange, eau",'clean'],
 ['Nutella','Biscuits NUTELLA Noisettes','pate aux NOISETTES et cacao (sucre, NOISETTES 13%), farine','clean'],
 ['avoine/oats','Avoine Simple','Filtered water, Organic gluten-free oats, Amylase','clean'],
 ['jeu de mots','La Vie En Orange','jus de clementines, jus de pommes','clean'],
 ['chocolat %','Chocolate 70%','cacao, sucre, beurre de cacao','clean'],
 ['noix générique','Barre chocolat et noix','avoine, arachides, amandes, chocolat','clean'],
 ['canneberges','Melange noix chocolat et canneberges','arachides, canneberges sechees, chocolat, amandes','clean'],
 // ---- FAMILLE 5 : pièges à FAUX POSITIFS (ne doivent PAS être flaggés) ----
 ['herbes aromatiques','Sauce tomate basilic','tomates, basilic, herbes aromatiques, sel','clean'],
 ['dénomination','Preparation fromagere','lait, ferments','misleading'],
];
const o=console.log; console.log=()=>{};
const res=T.map(([lbl,n,i,exp])=>{const r=detectVerdict(n,i);return{lbl,n,v:r.verdict,exp,h:r.headline,ok:r.verdict===exp};});
console.log=o;
let ko=0, fam='';
for(const r of res){ if(!r.ok)ko++;
  console.log(`${r.ok?'✅':'❌'} ${r.v.padEnd(10)} (${r.exp.padEnd(10)}) ${r.lbl.padEnd(22)} ${r.ok?'':'→ '+r.h}`);
}
console.log(`\n${T.length-ko}/${T.length} passent` + (ko?` — ${ko} ÉCHEC(S)`:' — TOUT PASSE'));
