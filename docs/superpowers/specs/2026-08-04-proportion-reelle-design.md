# La proportion réelle de l'aliment promis — conception

Date : 2026-08-04 · Branche de travail : `develop`

## Problème

L'app répond aujourd'hui par oui ou par non : l'aliment promis par le nom est-il
présent dans la liste d'ingrédients ? Une bisque de homard contenant **3,8 % de
homard et 46 % d'eau** est donc déclarée conforme, au même titre qu'une bisque
qui en contient 30 %.

Or l'intention du produit, telle que formulée par l'utilisatrice :

> « Détecter les produits alimentaires qui nous arnaquent sur ce qu'ils
> prétendent vendre. Payer un produit cher alors qu'il n'y a que des aliments
> cheap qui le composent, c'est non. »

Présence et proportion ne sont pas la même promesse.

## Décision

Afficher la **proportion réelle** de l'aliment promis dans la colonne « Il y a
vraiment » : `homard 3,8 %`.

Périmètre volontairement étroit, fixé par l'utilisatrice : **l'app n'a qu'une
fonction, comparer la promesse du nom à la réalité de la liste.**

### Écarté

- **Le prix.** L'app n'a aucune donnée de prix et ne peut donc pas conclure à une
  arnaque. Elle montre la composition ; l'acheteur compare avec l'étiquette.
- **Le jugement nutritionnel.** Signaler un produit majoritairement sucre et huile
  de palme même quand son nom ne promet rien : c'est le rôle du Nutri-Score,
  déjà affiché.
- **La ligne « 1ᵉʳ ingrédient : eau 46 % ».** Testée en prototype (variante B),
  écartée : elle sort de la promesse du nom.
- **Un nouveau verdict.** Un pourcentage faible ne change pas le verdict dans ce
  lot. Le chiffre parle de lui-même. `findIngredientPercent` continue de
  produire « À vérifier » comme aujourd'hui.

## Source des données

`ingredients` de l'API v2 d'Open Food Facts, à ajouter à `PRODUCT_FIELDS`.

**Couverture vérifiée** : quand `ingredients_text` existe, `ingredients` existe
aussi. Aucune perte de couverture — la donnée est disponible exactement quand
l'app a déjà quelque chose à dire.

Chaque entrée porte `id` (identifiant taxonomique, ex. `en:lobster`), `text`
(texte de l'étiquette), `percent` (QUID déclaré), `percent_estimate` (calcul
d'OFF), et un tableau `ingredients` imbriqué pour les composés.

## Trois pièges, trouvés en prototypant avant d'écrire le code

**1. Le texte libre ment sur le poids.** Chercher « noisette » dans le texte
trouve « Pâte à tartiner aux NOISETTES », qui pèse **54 %**, alors que la
noisette elle-même n'y est qu'à **1,5 %**. Un facteur 36.
→ Le rattachement se fait sur l'**identifiant taxonomique**, jamais sur le texte.

**2. L'identifiant est en anglais.** « homard » ne trouve jamais `en:lobster`.
→ On traduit le mot promis via `INGREDIENT_VARIANTS` avant de comparer. C'est la
même mécanique que celle qui a corrigé les fausses accusations en v1.31.

**3. Le pourcentage déclaré n'est absolu qu'au premier niveau.** Imbriqué, il est
relatif à son parent : le « cacao 40 % » d'un biscuit est 40 % de la pâte à
tartiner, pas du biscuit.
→ `percent` seulement à la profondeur 0 ; `percent_estimate` sinon, toujours
absolu, **et signalé comme estimé**.

## Architecture

### Dans `rules.js` — une fonction, testable en Node

```
ingredientShare(word, ingredients) → { valeur, source: 'declare'|'estime' } | null
```

1. Aplatir l'arbre en gardant la profondeur.
2. Traduire `word` par `INGREDIENT_VARIANTS`.
3. Chercher un identifiant **exactement** égal à une variante (`en:lobster`).
4. Sinon une espèce plus précise (`en:american-lobster` finit par `lobster`).
5. Profondeur 0 et `percent` numérique → `declare`. Sinon `percent_estimate` →
   `estime`. Sinon `null`.

`detectVerdict(name, text, ingredients?)` accepte un troisième argument
facultatif. Sans lui, comportement strictement identique à aujourd'hui — les 85
tests existants continuent de passer sans modification.

Les mots de `CATEGORY_WORDS` sont exclus du chiffrage : le beurre d'un « beurre
d'amandes » n'est pas un ingrédient de sa propre liste.

### Dans `app.js` — affichage

`PRODUCT_FIELDS` gagne `ingredients`. `renderCompareValue` affiche
`homard 3,8 %`, le pourcentage en `IBM Plex Mono` couleur `--green`, suivi d'un
`estimé` discret en `--ink-soft` quand la valeur vient du calcul d'OFF.

Sans chiffre disponible, l'aliment s'affiche seul, exactement comme aujourd'hui.
**Jamais de chiffre inventé.**

## Gestion des cas limites

| Situation | Affichage |
|---|---|
| Ingrédient hors taxonomie (`_Select roasted peanuts_`) | aliment seul, sans chiffre |
| `ingredients` absent d'OFF | aliment seul, sans chiffre |
| Mot de catégorie (beurre, fromage) | aliment seul, sans chiffre |
| `percent_estimate` > 100 (vu : 103,86 sur des amandes) | plafonné à 100 |
| Plusieurs correspondances | la première, l'exacte primant sur l'espèce |

## Tests

`node test-rules.js` — nouvelle famille avec des extraits **réels** de données
OFF figés en fixtures, pas des objets inventés :

- bisque de homard : `en:lobster` déclaré à 12 % → `12, declare`
- bisque de homard : homard imbriqué → `3.8, estime`
- biscuits Nutella : « noisette » ne doit **pas** renvoyer les 54 % de la pâte à
  tartiner mais les 1,5 % de la noisette
- arachide hors taxonomie → `null`
- mot de catégorie → `null`
- `detectVerdict` sans 3ᵉ argument → résultat identique à aujourd'hui

Les 85 tests existants doivent passer sans être modifiés : c'est la preuve que
l'ajout est bien facultatif.

## Livraison

⚠️ **Prototype d'abord, site de test ensuite, prod en dernier** — trois étapes
séparées, chacune validée par l'utilisatrice. Ne jamais pousser `preview` et
`main` dans la même commande : c'est ce qui a laissé passer la régression
Android de la v1.28.

Bumper la version aux cinq endroits habituels.
