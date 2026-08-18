# Proposer des produits lisibles quand la fiche ne l'est pas

Spec du 2026-08-14. Statut : validée dans son principe, en attente de relecture.

## Le problème, mesuré

Quand Open Food Facts n'a pas la composition d'un produit, l'app affiche le nom,
un bandeau « Impossible de vérifier » et un bloc photo. Rien d'autre. C'est
honnête et c'est vide.

| Mesure | Valeur |
|---|---|
| Produits sans composition, Canada, 600 plus scannés | **8,3 %** |
| Idem, France | **0 %** |
| Parmi ces fiches, celles qui ont des catégories OFF | **90,9 %** |
| Celles qui ont une dénomination légale | 4,2 % |
| Celles qui reçoivent déjà un barème | 3,0 % |

Environ une fiche canadienne sur douze, et quasiment aucune en France. L'usage
de l'app est canadien à 96 % (122 requêtes CA contre 4 FR sur un mois).

**Le seul matériau abondant est la catégorie**, présente sur 90,9 % de ces
fiches. C'est ce que cette spec exploite.

## Ce qui est déjà en place et ne change pas

`legalTier` ne lit ni ne réclame la liste d'ingrédients : le barème s'affiche
déjà sur une fiche sans composition quand le nom ou la dénomination donne un
rang. Les 3,0 % mesurés se produisent aujourd'hui. Rien à coder de ce côté.

`findAlternative(product)` existe et cherche dans les catégories du produit, de
la plus précise à la plus large. Elle refuse déjà tout candidat qu'elle serait
incapable de juger elle-même : liste absente, langue non lue, verdict trompeur,
additif à risque. Cette porte reste intacte.

## Ce qu'on livre

### 1. Le déclenchement

`findAlternative` ne se lance aujourd'hui que sur `misleading`, `warning`, ou en
présence d'un additif à risque. On ajoute le verdict `unknown`.

Sur les 9,1 % de fiches sans catégorie, rien ne s'affiche : l'écran reste ce
qu'il est aujourd'hui. On ne dégrade jamais, on ajoute quand on peut.

### 2. Quatre à cinq produits au lieu d'un

La fonction retourne aujourd'hui le premier candidat valable et s'arrête. Elle
retournera désormais une liste, plafonnée à **5**, avec un minimum utile de 1.

⚠️ **Borne de coût.** Chaque candidat coûte un appel `fetchProduct`. Le plafond
d'examen reste `ALTERNATIVE_MAX_CANDIDATS` et n'est pas relevé : on collecte
jusqu'à 5 valables PARMI les candidats déjà examinés, on n'en examine pas
davantage. Si la catégorie n'en fournit que 2, on en affiche 2. Le temps de
réponse ne doit pas augmenter.

### 3. « Si on les a », c'est-à-dire quoi

L'app refuse de noter. « De meilleure qualité » ne peut donc pas vouloir dire
« meilleur pour la santé ». Dans le vocabulaire de cette app, un produit est
préférable quand **son étiquette tient ce qu'elle promet**. Trois critères, tous
déjà calculés, aucun nouveau jugement :

1. Verdict `clean` avant `noclaim`. Un nom dont l'aliment est confirmé dit plus
   qu'un nom qui ne promet rien.
2. À barème égal, **rang supérieur d'abord**, quand les deux produits
   appartiennent à la même famille légale. C'est le seul classement que l'app
   s'autorise, et il vient de la loi, pas d'elle.
3. Aucun additif à risque. Déjà filtré, rappelé ici pour mémoire.

Les candidats sont triés selon ces critères, dans cet ordre. Aucun score n'est
affiché, aucun produit n'est déclaré meilleur qu'un autre : c'est l'ORDRE de la
liste qui porte l'information, comme le barème porte la sienne par sa position.

### 4. Ce qui est écrit à l'écran

Le bloc existant s'intitule « Alternative disponible ». Sur une fiche non lue,
le titre devient :

> **Des produits qu'on a pu lire**

Et rien d'autre. Pas de phrase expliquant qu'il ne s'agit pas d'une comparaison :
demandé explicitement le 2026-08-14, au motif que Yuka en propose dix sans se
justifier et que la précaution alourdit sans informer.

Chaque ligne reprend la présentation actuelle : vignette, nom, marque, chevron.
Le bloc reste **replié** et s'ouvre au toucher. Il n'apparaît qu'une fois la
recherche aboutie, donc sans jamais faire attendre l'écran.

## Ce qu'on ne fait pas

- Aucune comparaison chiffrée entre le produit scanné et les propositions : on
  ne sait rien du premier, par définition.
- Aucun tri nutritionnel, aucun Nutri-Score dans le classement.
- Aucune proposition sur les fiches sans catégorie.
- Aucun élargissement au-delà des catégories du produit : pas de « produits
  populaires » ni de suggestions de marque.

## Tests

Dans `test-alternatives.js`, nouveau fichier :

1. Le tri place `clean` avant `noclaim`.
2. À famille légale égale, le rang supérieur passe devant.
3. La liste est plafonnée à 5 et ne descend jamais sous 1 élément affiché.
4. Un candidat sans liste, en langue non lue, trompeur, ou porteur d'un additif
   à risque, n'entre jamais dans la liste. (Non-régression de la porte
   existante.)
5. Une fiche sans catégorie ne déclenche aucune recherche.

Vérification navigateur sur une fiche `unknown` réelle, dans WebKit : le bloc
apparaît replié, l'ouverture affiche entre 1 et 5 lignes, le clic ouvre la fiche
du produit choisi.

## Risques

**Le temps de réponse.** C'est le seul vrai risque. La borne d'examen inchangée
le contient, mais il faut le mesurer avant de livrer : temps entre l'affichage
de la fiche et l'apparition du bloc, sur une connexion lente.

**La pertinence des catégories OFF.** Une catégorie trop large peut proposer un
voisin sans rapport. `findAlternative` va déjà du plus précis au plus large et
écarte les catégories trop générales : ce comportement est conservé et devra
être relu sur de vrais résultats canadiens.

**L'effet de liste.** Cinq produits alignés ressemblent à un classement, même
sans note. C'est assumé : l'ordre PORTE une information, et elle est fondée sur
ce que la loi garantit, pas sur un avis.

---

## Suite : pourquoi la contribution photo ne débloque rien (2026-08-16)

Recherche menée dans la documentation et l'API de Robotoff, après que
l'utilisatrice a trouvé choquant qu'une photo attende quatre ans.

**Le chemin est débranché, ce n'est pas une file lente.**

1. Robotoff extrait automatiquement le texte de chaque photo d'ingrédients.
2. Le résultat n'est **jamais écrit** dans la fiche : il devient une proposition
   qui attend une validation humaine, et elle n'est créée que si **60 % au moins
   des ingrédients sont reconnus** par la taxonomie d'Open Food Facts.
3. **Ces propositions ne sont posées à personne.** Sur 100 questions tirées au
   hasard parmi celles servies aux contributeurs : 98 catégories, 1 label,
   1 emballage, zéro ingrédient. Demandées explicitement, l'API répond
   `count: 0, status: no_questions`.

Le dépôt Hunger Games le confirme dans sa propre description : catégories,
labels, poids, marques, logos, « nous aurions besoin de porter les ingrédients
depuis l'ancienne version ».

**File d'attente mesurée sur 150 propositions non validées :** âge médian
426 jours, 86 de plus d'un an, aucune entre 1 et 6 mois, 62 de moins de 30 jours.
Du frais, un stock gelé, et rien entre les deux. Langues : anglais 65,
français 38, allemand 7. Les utilisatrices canadiennes sont les premières
concernées.

⚠️ Réserve : les compteurs de Robotoff plafonnent à 100 par page, le total de la
file reste inconnu.

**Conséquence pour l'app**, déjà appliquée en v2.31 : la photo est stockée et
visible, mais rien ne la transforme en texte. Aucune promesse n'est faite, ni
sur le délai, ni sur le résultat.
