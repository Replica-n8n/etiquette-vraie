# Scan iPhone par photo — conception

Date : 2026-08-02 · Branche de travail : `develop`

## Problème

`BarcodeDetector` n'existe pas dans WebKit, et Apple impose WebKit à tous les
navigateurs sur iOS. Aucun iPhone ne peut donc scanner, quel que soit le
navigateur installé. Rien n'indique qu'Apple prévoie de l'implémenter : ce n'est
pas une version d'iOS à attendre.

Aujourd'hui ces utilisateurs voient : « Scanner non supporté ici. Utilise Chrome
sur Android, ou cherche par nom. » (`app.js:325`). Le conseil est impossible à
suivre sur iOS — Chrome y est aussi soumis à WebKit. Le message revient à leur
dire de changer de téléphone.

Confirmé le 2026-08-02 sur un iPhone réel en v1.25 : même écran depuis le
navigateur intégré de WhatsApp **et** depuis Safari. Cohérent avec l'absence de
`BarcodeDetector` dans WebKit, quel que soit le point d'entrée.

Corrigé en v1.26 en attendant le décodeur : message honnête (l'ancien conseillait
« Chrome sur Android », impossible depuis un iPhone) et suppression du cadre
caméra vide qui laissait croire à une panne.

## Décision

Sur iPhone : aperçu caméra en direct, plus un bouton déclencheur. Le décodage se
fait à la demande, sur l'image capturée, via ZXing compilé en WebAssembly.

Pas de décodage vidéo en continu : c'est le coût que cette conception évite.

Le scan en direct reste possible plus tard sans rien jeter — il consiste à
appeler le même décodeur en boucle. La photo est une étape, pas une impasse.

### Écarté

- **Scan vidéo temps réel sur iOS.** Coûteux en CPU et en batterie, risque de
  lenteur sur les appareils plus anciens.
- **Retour à Quagga.** Abandonné pour fiabilité insuffisante ; ZXing-WASM est le
  moteur C++ de référence compilé, pas un décodeur JS artisanal.
- **Saisie du code-barres au clavier.** Personne ne tape 13 chiffres. La porte de
  sortie en cas d'échec est la recherche par nom, qui existe déjà.
- **Détection par user-agent.** Fragile. On teste la capacité réelle.

## Architecture

Bascule par détection de capacité, à un seul endroit :

```
startScanner()
  ├─ caméra ouverte (commun, code actuel inchangé)
  ├─ BarcodeDetector présent  → boucle 100 ms          ← Android, intouché
  └─ BarcodeDetector absent   → bouton déclencheur      ← iPhone, nouveau
                                 └─ au clic : capture → décodage
```

`startScanner` reste le seul propriétaire de la caméra : ouverture
`getUserMedia`, insertion de la vidéo dans `#qr-reader`, coupure des pistes à la
sortie. Il n'y a pas deux scanners à maintenir, seulement deux façons d'obtenir
un code.

### Nouveau module : `barcode-decode.js`

Interface unique :

```
decodeFromVideo(videoElement) → chaîne (code-barres) ou null
```

Il ne connaît ni l'écran scan, ni Open Food Facts, ni les verdicts. Il prend une
vidéo, en extrait des images, les soumet à ZXing, rend une chaîne ou rien.
Testable et remplaçable isolément.

Chargé paresseusement par `import()` dynamique au premier appui sur le
déclencheur. **Un Android n'exécute jamais cette branche**, donc ne télécharge ni
le module ni le WASM : la non-régression est une propriété du chargement, pas une
promesse.

### Modification du code existant

`isValidBarcode` (longueur 8/12/13 + checksum GS1) est déclarée à l'intérieur de
`startScanner` (`app.js:296`), donc inaccessible ailleurs. Elle est remontée au
niveau du fichier pour que les deux chemins appliquent les mêmes règles. Simple
déplacement : même code, même comportement pour Android.

L'anti-faux-positifs « deux lectures identiques consécutives » ne s'applique
**pas** au chemin photo : il n'y a qu'une capture, et l'utilisateur a visé
délibérément. Le checksum GS1 suffit. Différence assumée entre les deux chemins.

## Parcours à l'écran

Le bouton déclencheur n'est créé que si `BarcodeDetector` est absent. Sur
Android, le DOM reste strictement identique à aujourd'hui.

Pleine largeur, environ 56 px de haut, en bas de l'écran — atteignable au pouce,
utilisable à une main.

Consigne selon le chemin :
- Android : « Pointe la caméra vers le code-barres. »
- iPhone : « Vise le code-barres, puis appuie sur le bouton. »

### États

| Moment | Bouton | Statut |
|---|---|---|
| Caméra prête | *Lire le code-barres* | ✓ Vise le code-barres |
| Tout premier appui | désactivé | Préparation du lecteur… |
| Appuis suivants | désactivé | Lecture… |
| Échec | réactivé | message d'aide |
| Succès | — | bascule sur la fiche produit |

« Préparation du lecteur » n'apparaît qu'une fois : c'est le téléchargement du
WASM. Sans cet état, le premier appui semble sans effet et l'utilisateur appuie
plusieurs fois.

### Un appui = trois images

Chaque déclenchement capture trois vues à ~150 ms d'intervalle et tente de
décoder chacune ; la première qui aboutit gagne. Invisible pour l'utilisateur,
et c'est le meilleur levier sur le taux de réussite : il ne dépend plus de
l'unique image où sa main a bougé.

### Échec de décodage

Le bouton reste actif pour réessayer, et un lien secondaire « Chercher par nom »
mène à l'écran de recherche existant. Les deux portes restent ouvertes.

- 1ᵉʳ échec : « Code-barres illisible. Rapproche-toi et évite les reflets. »
- 2ᵉ et suivants : « Toujours illisible. Pose le produit à plat et cadre le
  code-barres en entier. »

Aucune saisie de chiffres n'est jamais proposée.

## WASM et service worker

Le décodeur est versionné dans le repo sous `vendor/zxing/` : binaire `.wasm` et
sa glu JavaScript. Pas de CDN — hors-ligne préservé, aucune dépendance tierce,
rien d'externe exécuté chez les utilisateurs.

Version **lecture seule** de ZXing : l'app ne génère jamais de codes-barres.
Taille à mesurer à l'intégration, ordre de grandeur quelques centaines de Ko.

### Correction nécessaire dans `sw.js`

La branche par défaut (`sw.js:98`) sert depuis le cache, mais quand la ressource
n'y est pas, elle va sur le réseau **sans ranger le résultat** :

```js
caches.match(event.request).then((response) => response || fetch(event.request))
```

Un `.wasm` tomberait exactement là : plusieurs centaines de Ko retéléchargés à
chaque ouverture, et rien hors ligne. Invisible en test sur Wi-Fi, payé en
données mobiles par les utilisateurs.

→ Ajouter une branche explicite pour `.wasm` : cache-first **avec** mise en cache
après la première récupération.

### Pas de précache

Le WASM ne rejoint pas `urlsToCache` : sinon chaque Android télécharge à
l'installation un fichier qu'il n'exécutera jamais. Il est récupéré au premier
appui, puis conservé.

Conséquence assumée : sur iPhone, la première lecture exige du réseau ; ensuite
le hors-ligne fonctionne. L'invalidation est déjà gérée — `CACHE_NAME` change à
chaque build et les anciens caches sont supprimés.

## Tests

### Automatisables

- `isValidBarcode` remontée au niveau fichier : longueurs acceptées et rejetées,
  checksum GS1 valide et invalide, entrées non numériques. Logique pure,
  protège les deux chemins.
- Décodage réel : ZXing-WASM tourne aussi sous Node. Images de codes-barres
  connus — nette, floue, de travers — et vérification du résultat. Vrai test
  d'intégration du décodeur.
- `node test-rules.js` reste vert : le moteur de détection n'est pas touché.

### Non automatisables — iPhone réel requis

- autorisation caméra et aperçu dans Safari ;
- même parcours depuis la PWA installée sur l'écran d'accueil (cas
  historiquement le plus fragile) ;
- **ouverture depuis un lien de messagerie — cas PRINCIPAL, pas marginal.** Le
  lien de test a été diffusé par WhatsApp, Messenger **et** Signal : c'est ainsi
  que la majorité des utilisateurs arrivent. Chacune a sa propre WebView et ses
  propres réglages (certaines ouvrent dans Safari, d'autres gardent
  l'utilisateur dans l'app), et ces WebView restreignent parfois
  `getUserMedia`. L'aperçu caméra peut donc échouer là où il fonctionne dans
  Safari. **Tester les trois séparément**, et prévoir un message dédié « ouvre
  dans Safari » si l'une échoue — le message actuel ne couvre pas ce cas ;
- temps réel de bout en bout : appui → résultat ;
- vérification sur Android que le module et le WASM ne sont jamais chargés.

La fonctionnalité n'est pas terminée tant que ces tests manuels ne sont pas
faits.

## Livraison

Bumper la version aux cinq endroits, sinon les utilisateurs gardent l'ancien
code : `APP_VERSION` et `BUILD` dans `app.js`, `CACHE_NAME` dans `sw.js`, et les
`?v=` de `style.css`, `rules.js`, `app.js` dans `index.html`.

Le nouveau `barcode-decode.js` est chargé par `import()` dynamique, donc sans
`?v=` dans `index.html` : c'est `CACHE_NAME` qui l'invalide.

Livrer d'abord sur le site de test (`git push preview develop:main`), valider sur
un iPhone réel, puis seulement fusionner vers `main`.

## Hors périmètre

- Scan vidéo temps réel sur iOS (évolution ultérieure possible sur le même
  décodeur).
- Torche / lampe.
- La consigne de recherche (`index.html:51`) recommande encore de taper le
  code-barres « si le scan a échoué », ce qui contredit la décision prise ici.
  À reprendre lors d'un passage sur ces textes — pas dans ce lot.
