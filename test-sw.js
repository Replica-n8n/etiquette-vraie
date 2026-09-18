// Le service worker range la bonne version de chaque fichier.
// Lancer :  node test-sw.js
//
// Les relais de GitHub Pages gardent un fichier jusqu'à 10 minutes après une
// publication. `cache: 'reload'` ne contourne que le cache du téléphone : un
// service worker installé dans ces 10 minutes rangeait l'ANCIEN fichier dans
// le cache de la NOUVELLE version, et le resservait sans erreur jusqu'à la
// suivante (vécu sur le Chevalier le 2026-09-17). Chaque fichier se demande
// donc avec la VERSION dans son adresse.

const fs = require('fs');
const path = require('path');

const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const debut = sw.indexOf("addEventListener('install'");
const fin = sw.indexOf("addEventListener('activate'");
const install = debut >= 0 && fin > debut ? sw.slice(debut, fin) : '';

const echecs = [];
if (!install) echecs.push("installation introuvable dans sw.js");
if (!/'\?v=' \+ encodeURIComponent\(VERSION\)/.test(install)) echecs.push("l'installation ne met pas la version dans l'adresse");
if (/\.add(All)?\(/.test(install)) echecs.push("l'installation passe encore par cache.add ou addAll, sans la version");
if (!/cache\.put\(url, res\)/.test(install)) echecs.push("le fichier n'est pas rangé sous son nom propre");

if (echecs.length) {
  echecs.forEach((e) => console.log('ECHEC  ' + e));
  process.exit(1);
}
console.log('sw.js : 4/4 OK');
