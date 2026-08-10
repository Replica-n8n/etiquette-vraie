// Allégations « sans X » contredites par la liste d'additifs.
// Lancer :  node test-allegations.js
//
// C'est exactement l'astuce de terminologie que l'app est censée démasquer :
// écrire « sans colorant » sur la face avant et mettre un colorant dans la
// liste. Jusqu'ici l'app répondait « Rien à vérifier ».
//
// ⚠️ Le vrai danger de cette règle n'est pas de rater un menteur, c'est
// d'accuser un honnête. La moitié basse de ce fichier ne teste QUE ça : un
// additif qui n'appartient pas à la famille visée ne doit jamais déclencher.

const { claimConflict, detectVerdict } = require('./rules.js');

let pass = 0;
const echecs = [];

function ok(nom, condition, detail = '') {
  if (condition) { pass++; return; }
  echecs.push(`${nom}${detail ? '\n      ' + detail : ''}`);
}

// conflit attendu : famille visée + additifs fautifs
function conflit(nom, produit, additifs, familleAttendue, fautifsAttendus) {
  const r = claimConflict(produit, additifs);
  if (!r) return ok(nom, false, `aucun conflit détecté (attendu ${familleAttendue})`);
  ok(nom, r.famille === familleAttendue && r.fautifs.join(',') === fautifsAttendus.join(','),
    `famille=${r.famille} fautifs=${r.fautifs.join(',')} (attendu ${familleAttendue} / ${fautifsAttendus.join(',')})`);
}

function silence(nom, produit, additifs) {
  const r = claimConflict(produit, additifs);
  ok(nom, r === null, r ? `a accusé : ${r.famille} sur ${r.fautifs.join(',')}` : '');
}

console.log('--- FAMILLE 1 : contradictions réelles (le nom porte l\'allégation) ---');
conflit('sans colorant + E160a', 'Gaufrette sans colorant', ['en:e160a'], 'colorant', ['en:e160a']);
conflit('pluriel', 'Riz cantonais sans colorants', ['en:e160a'], 'colorant', ['en:e160a']);
conflit('majuscules', 'GAZPACHO SANS COLORANT', ['en:e150a'], 'colorant', ['en:e150a']);
conflit('sous-forme e160ai', 'Boisson sans colorant', ['en:e160ai'], 'colorant', ['en:e160ai']);
conflit('sans conservateur + E202', 'Pain de mie sans conservateur', ['en:e202'], 'conservateur', ['en:e202']);
conflit('sans conservateurs + E211', 'Sauce sans conservateurs', ['en:e211'], 'conservateur', ['en:e211']);
conflit('nitrite (jambon)', 'Jambon sans conservateur', ['en:e250'], 'conservateur', ['en:e250']);
conflit('sulfites', 'Vin sans conservateur', ['en:e220'], 'conservateur', ['en:e220']);
conflit('propionate', 'Brioche sans conservateur', ['en:e282'], 'conservateur', ['en:e282']);
conflit('no preservatives (EN)', 'Soup no preservatives', ['en:e202'], 'conservateur', ['en:e202']);
conflit('preservative-free (EN)', 'Preservative-free sauce', ['en:e211'], 'conservateur', ['en:e211']);
conflit('no artificial colours (EN)', 'Candy with no artificial colours', ['en:e129'], 'colorant', ['en:e129']);
conflit('sans additif + E330', 'Compote sans additif', ['en:e330'], 'additif', ['en:e330']);
conflit('sans additifs + amidon modifié', 'Plat sans additifs', ['en:e1442'], 'additif', ['en:e1442']);
conflit('plusieurs fautifs', 'Bonbon sans colorant', ['en:e330', 'en:e129', 'en:e102'], 'colorant', ['en:e129', 'en:e102']);
conflit('sans édulcorant + E951', 'Boisson sans edulcorant', ['en:e951'], 'edulcorant', ['en:e951']);
conflit('sans exhausteur + E621', 'Bouillon sans exhausteur de gout', ['en:e621'], 'exhausteur', ['en:e621']);

console.log('--- FAMILLE 2 : ne JAMAIS accuser à tort ---');
// L'additif existe, mais il n'appartient pas à la famille annoncée.
silence('sans colorant + acide citrique', 'Compote sans colorant', ['en:e330']);
silence('sans colorant + gélifiant', 'Confiture sans colorant', ['en:e440']);
silence('sans colorant + lécithine', 'Chocolat sans colorant', ['en:e322']);
silence('sans conservateur + colorant', 'Bonbon sans conservateur', ['en:e160a']);
silence('sans conservateur + acide citrique', 'Sauce sans conservateur', ['en:e330']);
silence('sans conservateur + antioxydant E300', 'Jus sans conservateur', ['en:e300']);
silence('sans conservateur + E306 tocophérols', 'Huile sans conservateur', ['en:e306']);
// ⚠️ Les 200 ne sont pas tous des conservateurs : E290 est du gaz carbonique,
// E296 et E297 sont des acidifiants. Les inclure accuserait toute eau pétillante
// vendue « sans conservateur ».
silence('sans conservateur + CO2 (E290)', 'Eau petillante sans conservateur', ['en:e290']);
silence('sans conservateur + acide malique (E296)', 'Boisson sans conservateur', ['en:e296']);
silence('sans conservateur + acide fumarique (E297)', 'Poudre sans conservateur', ['en:e297']);
// L'acide lactique et les acétates régulent l'acidité ; les compter en
// conservateurs accuserait des yaourts et des pains au levain.
silence('sans conservateur + acide lactique (E270)', 'Yaourt sans conservateur', ['en:e270']);
silence('sans conservateur + acétate (E262)', 'Chips sans conservateur', ['en:e262']);

// Aucune allégation : l'app n'a rien à dire, même bourrée d'additifs.
silence('aucune allégation', 'Bonbon multicolore', ['en:e129', 'en:e102', 'en:e133']);
silence('aucun additif', 'Compote sans colorant', []);
silence('additifs absents (champ manquant)', 'Compote sans colorant', undefined);
// Le produit EST un colorant : « colorant » dans le nom n'est pas « sans colorant ».
silence('produit colorant', 'Spray colorant marron fonce', ['en:e129']);
silence('colorant en poudre', "Colorant en poudre foret d'emeraude", ['en:e133']);
// Allégations voisines qui ne portent pas sur les additifs.
silence('sans sucre', 'Yaourt sans sucre ajoute', ['en:e160a']);
silence('sans gluten', 'Pain sans gluten', ['en:e160a']);
silence('sans lactose', 'Creme sans lactose', ['en:e202']);
silence('sans huile de palme', 'Pate a tartiner sans huile de palme', ['en:e322']);
// « sans colorant ARTIFICIEL » : E160a est un colorant naturel, l'allégation
// tient. Accuser ici serait un contresens - et c'est le cas le plus courant.
silence('sans colorant artificiel + colorant naturel', 'Bonbon sans colorant artificiel', ['en:e160a']);
silence('no artificial colours + naturel', 'Candy no artificial colours', ['en:e160a']);
conflit('sans colorant artificiel + colorant de synthèse', 'Bonbon sans colorant artificiel', ['en:e129'], 'colorant', ['en:e129']);

// Codes imprécis d'Open Food Facts : « en:e14xx » veut dire « un amidon
// modifié, on ne sait pas lequel ». Lu comme « E14 », il tombait dans des
// plages qui ne sont pas les siennes.
console.log('--- FAMILLE 2 bis : codes imprécis ---');
silence('e14xx ne contredit pas « sans colorant »', 'Glace sans colorant', ['en:e14xx']);
silence('e14xx ne contredit pas « sans conservateur »', 'Glace sans conservateur', ['en:e14xx']);
conflit('e14xx reste un additif', 'Glace sans additif', ['en:e14xx'], 'additif', ['en:e14xx']);

console.log('--- FAMILLE 3 : plusieurs allégations dans un même nom ---');
conflit('sans conservateur NI colorant -> le colorant', 'Gazpacho sans colorant ni conservateur', ['en:e160a'], 'colorant', ['en:e160a']);
conflit('sans conservateur NI colorant -> le conservateur', 'Gazpacho sans colorant ni conservateur', ['en:e202'], 'conservateur', ['en:e202']);

console.log('--- FAMILLE 4 : intégration au verdict ---');
// Sans contexte (2 arguments), le moteur ne change pas d'un iota : c'est ce qui
// garantit que les 135 tests existants restent valables.
const sansContexte = detectVerdict('Compote sans colorant', 'pommes, sucre, e160a');
ok('2 arguments : comportement inchangé', sansContexte.verdict === 'noclaim' || sansContexte.verdict === 'clean',
  `verdict=${sansContexte.verdict}`);

// « Rien à vérifier » devient « Trompeur » : c'est tout l'objet de la règle.
const v1 = detectVerdict('Gaufrette sans colorant', 'farine, sucre, colorant e160a', { additivesTags: ['en:e160a'] });
ok('noclaim -> misleading', v1.verdict === 'misleading', `verdict=${v1.verdict} — ${v1.headline}`);
ok('le libellé nomme l\'additif', /E160a/i.test(v1.headline || ''), v1.headline);
ok('le libellé cite l\'allégation', /colorant/i.test(v1.headline || ''), v1.headline);
ok('la règle est identifiable', v1.detail && v1.detail.rule === 'allegation-contredite', JSON.stringify(v1.detail));

// Un produit honnête sur ce point garde son verdict.
const v2 = detectVerdict('Gaufrette sans colorant', 'farine, sucre, acide citrique', { additivesTags: ['en:e330'] });
ok('pas de conflit : verdict inchangé', v2.verdict !== 'misleading', `verdict=${v2.verdict}`);

// Le verdict de base accuse DÉJÀ : on ne l'écrase pas, on ajoute l'information.
const v3 = detectVerdict('Biscuit fraise sans colorant', 'farine, arome fraise, e129', { additivesTags: ['en:e129'] });
ok('accusation existante conservée', v3.verdict === 'misleading', `verdict=${v3.verdict}`);
ok('accusation existante : le libellé reste celui de la saveur', /fraise/i.test(v3.headline || ''), v3.headline);
ok('le conflit est tout de même signalé', v3.detail && v3.detail.claim && v3.detail.claim.famille === 'colorant',
  JSON.stringify(v3.detail && v3.detail.claim));

// « À vérifier » : le fabricant a prévenu sur la saveur, mais ment sur le
// colorant. Le mensonge est plus grave que la réserve : il l'emporte.
const v4 = detectVerdict('Barre chocolatee sans colorant', 'avoine, morceaux gout chocolat, e150a', { additivesTags: ['en:e150a'] });
ok('warning -> misleading', v4.verdict === 'misleading', `verdict=${v4.verdict} — ${v4.headline}`);

// Composition absente : aucune conclusion possible, l'allégation ne change rien.
const v5 = detectVerdict('Compote sans colorant', '', { additivesTags: ['en:e160a'] });
ok('unknown reste unknown', v5.verdict === 'unknown', `verdict=${v5.verdict}`);

console.log(`\n${pass}/${pass + echecs.length} passent`);
if (echecs.length) {
  console.log('\nÉCHECS :');
  for (const e of echecs) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('TOUT PASSE');
