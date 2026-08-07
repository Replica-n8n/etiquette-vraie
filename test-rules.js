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
 // "Beurre" est une CATÉGORIE : la liste dit "crème pasteurisée, sel", jamais
 // "beurre". L'app ne peut donc rien confirmer - et ne doit rien affirmer.
 ['beurre réel','Beurre doux','creme pasteurisee, sel','noclaim'],
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
 ['fruity (vague, hors périmètre)','Fruity Loops','corn, sugar, natural flavour','noclaim'],
 ['flavoured (EN)','Strawberry Flavoured Milk','milk, sugar, strawberry flavour','warning'],
 ['façon','Terrine façon grand-mere','porc, sel','noclaim'],
 ['type','Fromage type feta','lait, sel, ferments','noclaim'],
 ['REGRESSION Fromage Blanc','Fromage Blanc','lait ecreme pasteurise, creme pasteurises, ferments lactiques','noclaim'],
 ['imitation (nom)','Imitation crabe','surimi, amidon, arome de crabe','warning'],
 // ---- FAMILLE 3 : quantité en trace -> CONFORME (décision du 2026-08-04) ----
 // Un seuil de pourcentage ne dit rien de la loyauté d'un nom : 2 % d'amande,
 // c'est de l'amande, et une bisque à 3,8 % de homard contient du homard.
 // Aucun seuil n'est juste dans toutes les catégories - une soupe est liquide
 // par définition. Le pourcentage réel est AFFICHÉ dans "Il y a vraiment" et
 // l'acheteur juge avec son contexte.
 ['2% framboise','Barre framboise','avoine, sucre, framboise 2%, huile','clean'],
 ['1,5% citron','Tarte citron','farine, oeufs, citron 1,5%','clean'],
 ['% avant le mot','Yaourt fraise','lait, 3% de fraise, sucre','clean'],
 ['12% = correct','Biscuit noisette','farine, noisettes 12%, sucre','clean'],
 ['bisque 3,8% homard','Bisque de homard','eau, homard 3.8%, poisson, tomate','clean'],
 ['lait amande 2%','Lait d amande','eau, amandes 2%, sel marin','clean'],
 // Réserve dans le nom MAIS chocolat réellement présent : conforme. Le mot de
 // réserve ne déclenche "À vérifier" que si l'aliment n'est pas là.
 ['reserve + chocolat reel','Barre chocolatee','avoine, sucre, chocolat 2%','clean'],
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
 // ---- FAMILLE 11 : TABLEAU NUTRITIONNEL pris pour une liste d'ingrédients ----
 // Cas réel (Cocoa Camino, 0752612000113) : l'OCR d'OFF a rangé un morceau du
 // tableau nutritionnel dans le champ ingrédients. Le garde-fou exigeait DEUX
 // marqueurs forts ; ce texte n'en portait qu'un, "Nutrition Facts". Une poudre
 // de cacao équitable était donc accusée de ne pas contenir de cacao.
 ['tableau US reel','Cocoa Camino Fairtrade Cocoa','able 10 Carbohydrate / Glucides 2 g Fibre / Fibres 2g Sugars / Sucres 0 g Protein / Proteines 1 g Cholesterol/Cholesterol 0 mg CANADIAN Nutrition Facts','unknown'],
 ['Nutrition Facts seul','Chocolate bar','Nutrition Facts per serving 12 g','unknown'],
 ['valeur nutritive (CA)','Barre chocolat','Valeur nutritive par portion 30 g','unknown'],
 ['valeurs nutritionnelles','Barre chocolat','Valeurs nutritionnelles moyennes pour 30 g','unknown'],
 ['kcal seul','Barre chocolat','245 kcal par portion, lipides 12 g','unknown'],
 // Une VRAIE liste d'ingrédients ne doit jamais être prise pour un tableau
 ['vraie liste + sucres','Chocolat noir','cacao, sucre, beurre de cacao, emulsifiant','clean'],
 ['vraie liste + proteines','Barre proteinee','proteines de lait, cacao, sucre, amandes','noclaim'],
 ['vraie liste + fibres','Biscuit','farine, fibres de ble, sucre, cacao','noclaim'],
 // ---- FAMILLE 6 : nom et ingrédients dans des LANGUES DIFFÉRENTES ----
 // Très fréquent au Canada : OFF ne stocke souvent qu'UNE seule langue. Sans
 // correspondance FR<->EN, le moteur cherchait "pomme" dans "apples" et
 // accusait des produits parfaitement honnêtes.
 ['pomme/apple','Compote de pommes','apples, water, sugar','clean'],
 ['pomme/apple jus','Jus de pomme','apple juice concentrate, water','clean'],
 ['framboise/raspberry','Yaourt a la framboise','milk, raspberries, sugar','clean'],
 ['citron/lemon','Tarte au citron','wheat flour, lemon juice, eggs, sugar','clean'],
 ['cerise/cherry','Confiture de cerises','cherries, sugar, pectin','clean'],
 ['mangue/mango','Sorbet mangue','mango puree, water, sugar','clean'],
 ['banane/banana','Pain a la banane','flour, bananas, eggs, sugar','clean'],
 ['peche/peach','Yaourt peche','milk, peaches, sugar','clean'],
 ['myrtille/blueberry','Muffins aux myrtilles','flour, blueberries, sugar','clean'],
 ['cannelle/cinnamon','Biscuits a la cannelle','flour, cinnamon, butter','clean'],
 ['apple/pomme inverse','Apple Sauce','pommes, eau, sucre','clean'],
 ['lemon/citron inverse','Lemon Tart','farine de ble, jus de citron, oeufs','clean'],
 // La tromperie doit rester détectée MALGRÉ le changement de langue
 ['arome EN, nom FR','Yaourt a la fraise','milk, sugar, strawberry flavour','misleading'],
 ['arome FR, nom EN','Strawberry Yogurt','lait, sucre, arome de fraise','misleading'],
 // ---- FAMILLE 7 : aliments hors du périmètre initial ----
 // Le dictionnaire ne couvrait que fruits et arômes : légumes, légumineuses,
 // poissons, viandes, céréales et épices passaient tous en "clean" par défaut.
 ['pois chiche FR','Pois chiches biologiques','pois chiches biologiques, eau, sel','clean'],
 ['chickpea EN','Organic Chickpeas','organic chickpeas, water, sea salt','clean'],
 ['pois chiche croise','Houmous de pois chiches','chickpeas, tahini, lemon juice','clean'],
 ['sardine','Sardines a la sauce tomate','sardines, sauce tomate, sel','clean'],
 ['tomate/tomato','Sauce tomate','tomatoes, salt, basil','clean'],
 ['tomate absente','Sauce tomate','eau, amidon modifie, arome de tomate','misleading'],
 ['carotte/carrot','Soupe de carottes','carrots, water, cream','clean'],
 ['epinard/spinach','Pates aux epinards','wheat flour, spinach powder, eggs','clean'],
 ['gingembre/ginger','Biscuits au gingembre','flour, ginger, sugar','clean'],
 ['ble/wheat','Pain de ble entier','whole wheat flour, water, yeast','clean'],
 ['lentille/lentil','Soupe aux lentilles','lentils, water, carrots, salt','clean'],
 ['porc/pork','Saucisses de porc','pork, salt, spices','clean'],
 ['riz/rice','Galettes de riz','rice, salt','clean'],
 ['olive','Tapenade aux olives','olives, huile, capres','clean'],
 // Piège : "pomme de terre" n'est pas une pomme
 // "Pomme de terre" n'est pas une pomme, mais c'est bien une PATATE : le piège
 // retire "pomme" ET pose "patate" à la place, donc la vérification a lieu.
 ['pomme de terre EN','Chips de pommes de terre','potatoes, sunflower oil, salt','clean'],
 ['pomme de terre FR','Puree de pommes de terre','pommes de terre, lait, beurre','clean'],
 // Et surtout : ces produits ne doivent JAMAIS être accusés au titre de la POMME.
 ['pomme de terre sans pomme','Galette de pommes de terre','pommes de terre, oignon, sel','clean'],
 // Une vraie pomme reste une vraie pomme (non-régression du piège).
 ['vraie pomme malgre le piege','Compote de pommes','apples, water, sugar','clean'],
 // ---- FAMILLE 12 : "patate" et "pomme de terre" sont le MÊME aliment ----
 // Bug de production trouvé le 2026-08-07 : "patate" était dans le dictionnaire
 // mais ses variantes ne connaissaient que "patate" et "potato". Or une liste
 // d'ingrédients française écrit "pommes de terre" - jamais "patates". Tout
 // produit nommé avec "patate" était donc déclaré TROMPEUR alors qu'il contient
 // exactement ce qu'il annonce. C'est la faute type que la règle des paires
 // FR/EN existe pour empêcher : un mot cherché dans un nom sans la forme sous
 // laquelle il s'écrit vraiment dans les ingrédients.
 ['patate -> pommes de terre','Chips de patates','pommes de terre, huile de tournesol, sel','clean'],
 ['patate -> puree','Puree de patates','pommes de terre, lait, beurre','clean'],
 ['patate -> potatoes EN','Chips de patates','potatoes, sunflower oil, salt','clean'],
 // La patate rejoint CATEGORY_WORDS : absente de la liste, on ne conclut RIEN.
 // Arbitrage assumé - une liste d'ingrédients en néerlandais ("Aardappelen")
 // ferait sinon accuser un vrai sac de pommes de terre belge (cas réel,
 // 5400141464344). Personne ne truque la patate : c'est un féculent bon marché,
 // pas un ingrédient noble qu'on imite. On préfère rater la galette sans patate
 // plutôt qu'accuser un produit honnête.
 ['patate absente = muet','Galette de pommes de terre','farine de ble, eau, sel, arome','noclaim'],
 ['patate en arome = signale','Chips de patates','farine de mais, arome de pomme de terre, sel','misleading'],
 ['liste en neerlandais','Pomme de terre','aardappelen, water, zout','noclaim'],
 // ---- FAMILLE 13 : PLURIELS FRANÇAIS EN -X ----
 // Bug de production trouvé le 2026-08-07 sur "Velouté poireau et pomme de
 // terre" [3760325480433] : ses ingrédients disent "Poireaux", et pluralPattern
 // ne savait former que "poireaus"/"poireaues". Le produit était donc accusé de
 // ne pas contenir de poireau alors que c'est son premier ingrédient.
 ['poireaux dans les ingrédients','Veloute poireau et pomme de terre','poireaux, eau, pomme de terre, lait, sel','clean'],
 ['poireaux dans le nom','Soupe aux poireaux','poireaux, eau, creme, sel','clean'],
 ['choux dans les ingrédients','Salade de chou','choux blancs, carottes, vinaigre','clean'],
 // ---- FAMILLE 8 : substitution d'un aliment cher par un moins cher ----
 // Le coeur du sujet : payer le prix du noble, manger le bon marché.
 ['cabillaud -> pangasius','Filet de cabillaud','pangasius, eau, sel','misleading'],
 ['cepe -> champignon','Terrine de cepes','champignons de paris, arome de cepe','misleading'],
 ['homard absent','Soupe de homard','eau, amidon, arome de homard','misleading'],
 ['truffe absente','Tapenade aux truffes','olives, arome de truffe','misleading'],
 ['boeuf -> cheval','Lasagnes au boeuf','viande de cheval, pates, tomates','misleading'],
 // ---- FAMILLE 9 : pièges de CATÉGORIE (ne doivent PAS être flaggés) ----
 // Un aliment dont la liste d'ingrédients ne le nomme jamais lui-même.
 ['bar = barre EN','Granola Bar','oats, chocolate, sugar','noclaim'],
 ['bar chocolate','Chocolate Bar','cocoa, sugar, cocoa butter','clean'],
 ['fromage nomme','Fromage cheddar fort','lait, sel, ferments, colorant','noclaim'],
 ['pesto = preparation','Pates au pesto','pates, basilic, huile olive, pignons','noclaim'],
 ['couscous = plat','Couscous royal','semoule, agneau, poulet, legumes','noclaim'],
 ['risotto cepes reel','Risotto aux cepes','riz, cepes, bouillon, parmesan','clean'],
 // ---- FAMILLE 10 : ALLERGÈNES SOULIGNÉS PAR OPEN FOOD FACTS ----
 // OFF encadre les allergènes de tirets bas : "_cacahuètes_". En expression
 // régulière, "_" est un caractère de MOT : \bcacahuetes\b ne correspond donc
 // pas à "cacahuetes_". Résultat : tout produit dont l'aliment promis est un
 // allergène était accusé de ne pas le contenir - or ce sont exactement les
 // aliments les plus mis en avant dans les noms.
 ['arachide soulignée','Smooth Peanut Butter','_Select roasted peanuts_, Soybean oil, Sugar, Salt','clean'],
 ['cacahuète soulignée','Beurre de cacahuete','_cacahuetes_ grillees, huile, sel','clean'],
 ['amande soulignée EN','Almond Milk','water, _almonds_, sea salt','clean'],
 ['amande soulignée FR','Lait d amande','eau, _amandes_, sel','clean'],
 ['blé souligné','Pain de ble complet','farine de _ble_ complet, eau, levure','clean'],
 ['soja souligné','Yaourt au soja','_soja_, ferments','clean'],
 ['oeuf souligné','Gateau aux oeufs','farine, _oeufs_, sucre','clean'],
 ['sésame souligné','Sauce au sesame','huile, _sesame_, sel','clean'],
 // La tromperie doit rester détectée même avec des tirets bas autour
 ['arôme malgré soulignement','Biscuit fraise','farine, _lait_, arome fraise','misleading'],
 // ---- FAMILLE 11 : AUCUNE PROMESSE DANS LE NOM -> "Rien à vérifier" ----
 // Mesuré le 2026-08-07 sur les 400 produits les plus scannés d'OFF (242
 // fiches jugeables) : 57,4 % des noms ne contiennent AUCUN mot d'aliment.
 // L'app renvoyait alors "clean" + "Le nom du produit correspond à sa
 // composition réelle" - une correspondance qu'elle n'avait jamais vérifiée.
 // C'était son écran le plus fréquent, et sa seule affirmation fausse.
 // Ces quatre cas sont de VRAIES fiches OFF (nom et ingrédients d'origine).
 ['marque seule','Nutella','sucre, huile de palme, _noisettes_ 13%, cacao maigre','noclaim'],
 ['nom de marque','Coca-Cola','eau gazeifiee, sucre, colorant: e150d, acidifiant: acide phosphorique, aromes naturels','noclaim'],
 ['eau de source','CRISTALINE Eau De Source 0.5L','eau de source','noclaim'],
 ['skyr nature','Skyr nature 0%','lait ecreme - lait concentre ecreme - ferments lactiques','noclaim'],
 // Garde-fou : un nom qui promet VRAIMENT un aliment doit rester "clean",
 // pas basculer dans le nouvel état. C'est la frontière entre les deux verts
 // d'avant : "j'ai vérifié et ça colle" vs "il n'y avait rien à vérifier".
 ['promesse tenue reste clean','Sardines huile d olive vierge extra','_sardines_, huile d\'olive vierge extra, sel','clean'],
];
const o=console.log; console.log=()=>{};
const res=T.map(([lbl,n,i,exp])=>{const r=detectVerdict(n,i);return{lbl,n,v:r.verdict,exp,h:r.headline,ok:r.verdict===exp};});
console.log=o;
let ko=0, fam='';
for(const r of res){ if(!r.ok)ko++;
  console.log(`${r.ok?'✅':'❌'} ${r.v.padEnd(10)} (${r.exp.padEnd(10)}) ${r.lbl.padEnd(22)} ${r.ok?'':'→ '+r.h}`);
}
console.log(`\n${T.length-ko}/${T.length} passent` + (ko?` — ${ko} ÉCHEC(S)`:' — TOUT PASSE'));
