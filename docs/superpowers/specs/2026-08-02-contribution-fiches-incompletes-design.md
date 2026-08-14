# Contribution photo sur fiches incomplètes, conception

Date : 2026-08-02 · Branche de travail : `develop`

## Problème

Le formulaire de contribution ne s'affiche que si le produit est **absent**
d'Open Food Facts : `setContributeTarget` n'est appelé que depuis
`showResultError`, avec le code d'un produit introuvable (`app.js:1023`).

Une fiche qui **existe mais est vide** est donc inatteignable. C'est pourtant le
cas le plus fréquent, et celui qui produit le verdict « impossible de vérifier ».

Cas déclencheur : `062020172365`, Nutella B-ready de Ferrero. Présent dans OFF en
`rev: 1`, créé par une autre app, avec `product_name` faux (« Butters Chocolate
Bar »), `brands` faux (« Nutella » au lieu de Ferrero), aucune photo, aucun
ingrédient. L'app affichait « impossible de vérifier » sans rien pouvoir proposer.

## Ce que Robotoff fait, et ne fait pas

Vérifié sur la documentation puis **observé en direct** sur ce produit.

Robotoff produit des *prédictions* (données brutes) puis des *insights*
(suggestions actionnables). Règle centrale : **aucun insight n'est créé si le
produit possède déjà l'attribut**. Les insights complètent, ils ne corrigent pas.

Il n'existe **pas** de type d'insight `product_name`. Photographier la face avant
ne fera jamais corriger un nom.

Test réel du 2026-08-02, après envoi de la photo d'ingrédients :

```
insights   : ingredient_detection (en), nutrient_extraction   → en attente
predictions: brand | Nutella
             brand | Ferrero        ← reconnu, mais AUCUN insight créé
```

Robotoff a reconnu Ferrero sur la photo et n'a rien fait, parce que `brands`
était déjà rempli. **La donnée fausse se protège elle-même.** Seul un humain peut
corriger un nom ou une marque erronés.

L'extraction d'ingrédients exige par ailleurs qu'aucune liste n'existe pour la
langue détectée, et qu'au moins 60 % des ingrédients soient reconnus. Elle est
**validée par un annotateur humain**, pas appliquée automatiquement.

## Décision

**Photo seule.** Aucun champ texte sur ce chemin. On débloque le verdict sans
jamais toucher à une donnée existante.

Conséquence assumée : les noms et marques faux restent. Aucun mécanisme
automatique ne peut les réparer, et on choisit de ne pas ouvrir la correction
manuelle pour l'instant.

### Écarté

- **Compléter les champs vides par saisie.** Sur le cas déclencheur il n'y aurait
  rien à saisir : les champs sont remplis, mais faux.
- **Corriger les champs existants.** Seul chemin qui répare vraiment, mais il
  expose une donnée publique à une saisie approximative. Reporté, pas abandonné.
- **Préfixe `add_`.** Sans champ texte, la question ne se pose pas dans ce lot.
  Elle reste ouverte pour le formulaire « produit absent ».

## Validation préalable du pipeline

Fait avant d'écrire la moindre ligne d'interface, en production réelle, sur le
compte `juoff` :

```
POST /contribute { code, image, lang } → HTTP 200, { image: { status: "status ok" }, ok: true }
```

Résultat sur OFF : `rev` 1 → 3, `image_ingredients_url` créée,
`data_sources` enrichi de `App - etiquettevraie`, `ingredients_text` toujours
vide (en attente de validation).

**Le Worker n'a donc rien à changer.** `handleContribute` conditionne la branche
texte à `if (name || brands)` et la branche image à `if (body.image)`,
indépendamment ; `result.ok` se base sur le succès de l'image. Le chemin photo
seule fonctionnait déjà, il n'avait jamais été appelé.

## Architecture

### Point d'entrée

Sur l'écran résultat, quand le verdict vaut `unknown`, les deux cas de
`rules.js` : ingrédients absents, et tableau nutritionnel capturé à leur place.

Rien ailleurs : on ne demande pas de photo sur une fiche complète.

### Un second bloc, pas un déplacement

`#contribute-block` est imbriqué dans `#result-error`, donc inatteignable depuis
une fiche affichée. On crée un **bloc distinct, photo seule**, dans
`#result-content`.

Les deux blocs ont des textes, des champs et des situations différents ; les
fusionner en masquant conditionnellement des champs les coupleraient sans rien
gagner. En revanche la mécanique dessous, compression de l'image et envoi au
Worker, est **partagée**, pas dupliquée.

### Trois états, lus dans les données d'OFF

La coordination entre utilisateurs passe par l'état d'OFF, pas par une mémoire
locale : la question est justement ce que voit un utilisateur **différent**.

| `ingredients_text` | `image_ingredients_url` | Affichage |
|---|---|---|
| vide | absente | invitation à photographier |
| vide | présente | « photo envoyée, en attente de vérification » |
| remplie | rien | rien, la fiche est vérifiable |

Coût : ajouter `image_ingredients_url` à `PRODUCT_FIELDS`.

Sans cet état, plusieurs personnes photographiant le même produit produiraient
des révisions successives, chaque envoi **remplace** l'image d'ingrédients de
référence, donc une photo floue peut dégrader une photo nette, et autant de
suggestions Robotoff redondantes à traiter pour les annotateurs.

**Réserve :** si la photo présente est illisible, ce garde-fou l'ancre
définitivement. On garde donc une porte discrète (« la photo existante est
illisible ? ») plutôt qu'un blocage sec.

### Drapeau de mise en ligne

`CONTRIBUTE_ENABLED` coupe aujourd'hui toute contribution en prod. Il a été créé
à cause du risque de saisie approximative, risque inexistant ici.

On sépare donc en deux portes :
- formulaire texte « produit absent » : **reste coupé en prod** jusqu'à ce qu'il
  ait son champ dénomination et `add_brands` ;
- chemin photo : **ouvert en prod**, le pipeline ayant été validé en réel.

## Messages

L'invitation, sur fiche incomplète :

> Open Food Facts n'a pas la liste d'ingrédients de ce produit, donc rien à
> vérifier. Tu as l'emballage sous la main ? Photographie la liste d'ingrédients :
> ça débloquera la vérification, pour toi et pour les autres.

Le succès doit dire la vérité sur le délai, sinon l'utilisateur rescanne dans la
minute, revoit « impossible de vérifier » et conclut à un échec :

> Merci ! Ta photo est partie chez Open Food Facts. Les ingrédients apparaîtront
> une fois la lecture vérifiée par leur équipe, compte quelques jours.

État « déjà envoyée » :

> Une photo des ingrédients a déjà été envoyée pour ce produit. Open Food Facts
> doit encore la vérifier.

Échecs (photo trop lourde, envoi impossible, refus d'OFF) : messages existants,
qui distinguent déjà l'attente de la panne.

## Détail relevé pendant le test

L'image est attachée au champ `ingredients_${lang}` avec `lang = 'fr'` par
défaut, alors que Robotoff a détecté la liste en **anglais**
(`ingredient_detection | en`) sur cette étiquette canadienne bilingue. Les deux
ne coïncident pas nécessairement.

Sans conséquence observée ici, l'insight a été créé malgré tout. À surveiller si
d'autres produits bilingues remontent ; ne pas corriger à l'aveugle.

## Tests

### Automatisables

- `node test-rules.js` reste vert : `rules.js` n'est pas touché.
- Les trois états d'affichage se vérifient dans le navigateur en injectant un
  produit fabriqué (ingrédients vides avec et sans `image_ingredients_url`).

### Manuels

- Envoi réel depuis l'interface sur un produit incomplet.
- Vérification sur OFF que la révision progresse et que l'insight se crée.
- Le pipeline lui-même est **déjà validé** (voir plus haut).

## Livraison

Bumper la version aux cinq endroits : `APP_VERSION` et `BUILD` dans `app.js`,
`CACHE_NAME` dans `sw.js`, et les `?v=` de `style.css`, `rules.js`, `app.js`
dans `index.html`.

Rappel constaté en v1.26 : après déploiement, la prod peut servir l'ancienne
version au premier chargement, le temps que le service worker s'active. Recharger
avant de conclure à un échec.

## Hors périmètre

- Correction des noms et marques faux (nécessite un humain ; décision reportée).
- `add_brands` dans le Worker (concerne le formulaire texte, pas ce lot).
- Photo de la face avant, du tableau nutritionnel, des labels.
