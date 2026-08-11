// La langue se lit dans le TEXTE, pas dans le nom du champ.
// Lancer :  node test-langue.js
//
// Open Food Facts range parfois une liste espagnole ou italienne dans
// `ingredients_text_fr`. L'app cherchait alors du cabillaud dans de l'italien
// et concluait qu'il manquait. Vu en vrai sur trois produits de marque.
//
// ⚠️ Le risque de cette règle n'est pas de rater un texte étranger, c'est de
// rendre l'app MUETTE sur une fiche parfaitement française. D'où la règle
// comparative : la langue étrangère doit l'emporter STRICTEMENT sur le français
// et l'anglais réunis. À égalité, on continue de lire.

const { texteLisible, langueDuTexte, detectVerdict } = require('./rules.js');

let pass = 0;
const echecs = [];
function ok(nom, cond, detail = '') {
  if (cond) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}
const etranger = (nom, texte, langueAttendue) => {
  const l = langueDuTexte(texte);
  ok(nom, !texteLisible(texte) && l && l.langue === langueAttendue,
    l ? `détecté ${l.langue} (${l.temoins} contre ${l.temoinsFrEn})` : 'aucun témoin');
};
const lisible = (nom, texte) => {
  const l = langueDuTexte(texte);
  ok(nom, texteLisible(texte), l ? `écarté comme ${l.langue} (${l.temoins} contre ${l.temoinsFrEn})` : '');
};

console.log('--- Vraies langues étrangères (cas réels) ---');
// 4056489840848, Lidl : accusé de ne pas contenir de cabillaud.
etranger('italien', '65% merluzzo nordico, acqua, farina di frumento, oli vegetali', 'italien');
// 8480000171320, « Tomate frito » : espagnol rangé dans le champ français.
etranger('espagnol', 'Tomate, aceite de girasol, azucar, almidon modificado de maiz, sal, cebolla', 'espagnol');
// 5010265002911, « Dark Rye Crispbread » : espagnol dans le champ anglais.
etranger('espagnol en champ anglais', 'Harina integral de centeno, harina de centeno y sal', 'espagnol');
// 8690574002481, nectar turc rangé en français.
etranger('turc', 'icindekiler. Su, seker, visne konsantresi. asitlik duzenleyici', 'turc');
etranger('allemand', 'Zutaten: Zucker, Weizenmehl, pflanzliche Ole, Kakaobutter, Vollmilchpulver', 'allemand');
etranger('neerlandais', 'Ingredienten: suiker, tarwebloem, plantaardige olie, zout', 'neerlandais');
etranger('portugais', 'Ingredientes: acucar, farinha de trigo, leite, manteiga, fermento', 'portugais');

console.log('--- Ne JAMAIS faire taire une fiche lisible ---');
lisible('français ordinaire', 'farine de ble, sucre, huile de palme, cacao maigre, sel, arome vanille');
lisible('anglais ordinaire', 'wheat flour, sugar, palm oil, cocoa, salt, natural flavour');
// Les 32 fiches d'un seul ingrédient de l'échantillon : toutes valides.
lisible('eau de source', 'Eau de source');
lisible('amandes', 'Amandes.');
lisible('miel', 'Miel de Fleurs');
lisible("huile d'olive", "Huile d'olive vierge extra d'Espagne.");
lisible('sirop', "sirop d'erable.");
// Mots étrangers isolés DANS une liste française : très courant.
lisible('mozzarella di bufala', 'mozzarella di bufala, eau, sel, ferments lactiques');
lisible('parmesan', "farine de ble, parmesan, huile d'olive, sel, basilic");
lisible('chorizo et jambon serrano', 'pate a pizza, tomate, chorizo, jambon serrano, mozzarella, huile');
lisible('OCR abîmé mais français', "r.ardines, huile d'olives Vierge extra, citron (3%), sel.");
lisible('texte vide', '');
lisible('trop court pour juger', 'Sel');

console.log('--- Le verdict suit ---');
// Sans la règle, l'italien passait pour du français et l'app accusait.
const v = detectVerdict('Filet de cabillaud', '65% merluzzo nordico, acqua, farina di frumento');
ok('le moteur accuserait sans le garde-fou', v.verdict === 'misleading', v.verdict);
ok('mais le texte est bien jugé illisible', !texteLisible('65% merluzzo nordico, acqua, farina di frumento'));

console.log('--- Un champ illisible ne doit pas masquer un champ lisible ---');
// 8480000171320 « Tomate frito » : l'espagnol est rangé dans le champ FRANÇAIS,
// et le champ anglais contient du vrai anglais. L'ancienne logique prenait le
// premier champ REMPLI et lisait donc l'espagnol ; il faut prendre le premier
// champ LISIBLE. La règle RÉCUPÈRE alors une fiche au lieu d'en perdre une.
lisible('anglais réel du Tomate frito', 'tomato, sunflower oil, sugar, modified corn starch, salt, onion, garlic');
etranger('espagnol du même produit', 'Tomate, aceite de girasol, azucar, almidon modificado de maiz, sal, cebolla', 'espagnol');

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
