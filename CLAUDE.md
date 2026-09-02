# etiquette-vraie

PWA qui détecte le marketing alimentaire trompeur à partir d'un code-barres.
Vanilla JS, **aucun `package.json`, aucune dépendance, aucun build**. Les
tests sont des scripts Node lancés à la main.

## Le piège numéro un : le tampon de cache vit à CINQ endroits

Contrairement aux dépôts `workout` et `games`, où une seule constante suffit,
il faut ici changer le **même** tampon partout, sinon le téléphone continue de
servir un mélange d'ancien et de neuf :

| Fichier | Ce qu'il porte |
|---|---|
| `sw.js` | `CACHE_NAME = 'etiquette-vraie-<tampon>'` |
| `index.html` | `style.css?v=<tampon>` |
| `index.html` | `rules.js?v=<tampon>` |
| `index.html` | `app.js?v=<tampon>` |
| `app.js` | `const BUILD = '<tampon>'` |

`APP_VERSION` (`app.js`, ex. `v2.42`) est **autre chose** : c'est le numéro
affiché à l'utilisateur, il n'a aucun effet sur le cache. Les deux se
changent ensemble, mais ne servent pas à la même chose.

Contrôle : `grep -rn "<ancien tampon>" --include="*.js" --include="*.html" .`
doit ne plus rien renvoyer.

## Vérifier

Toute la batterie, avant de toucher au moteur de détection :

```bash
for f in test-*.js; do printf "%-28s " "$f"; node "$f" >/dev/null 2>&1 && echo OK || echo ECHEC; done
```

**Règle de la maison, écrite en tête de `test-rules.js` : toute nouvelle
tromperie découverte vient grossir la liste AVANT d'être corrigée.** Sinon
elle peut repasser inaperçue plus tard.

**Une règle se prouve sur de vrais produits, jamais en raisonnant.** Des tests
verts n'empêchent pas d'accuser un produit honnête : `test-produits-reels.js`
existe pour ça, et il faut lire les déclenchements un par un.

## Open Food Facts

**L'API v2 est obligatoire.** Les allergènes arrivent soulignés (`_x_`), les
compteurs sont plafonnés à 100. Robotoff ne soumet jamais la liste
d'ingrédients. Un proxy Cloudflare (`cloudflare-worker/`) sert la recherche.

## Branches

- `develop` : terrain d'essai, c'est là qu'on travaille.
- `main` : ce que reçoivent les utilisateurs. Ne jamais y casser la prod.
- Le dépôt distant `preview` sert le site de test.

## Écriture

Interface en français. Dire **« alimentaire »**, jamais « produit » tout seul :
un vrai utilisateur n'a pas compris la portée de l'app. Pas de tiret cadratin.
Une fonction que rien n'annonce n'existe pas.
