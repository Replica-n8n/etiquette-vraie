# Inventaire réglementaire : quelles familles ont encore des mots à décoder

Mesuré le 2026-08-13. Base : les 3000 produits les plus scannés d'Open Food Facts
(`states_tags:"en:categories-completed"`, tri `-unique_scans_n`), plus un
échantillon de 600 à 1800 fiches par famille candidate.
Scripts dans le scratchpad de session : `fetch-familles.mjs`, `part-du-rayon.mjs`,
`lisibilite.mjs`, `lisibilite2.mjs`.

Trois questions par famille, dans cet ordre, la première qui échoue tue la famille :

1. **La loi définit-elle des mots ?**
2. **Ces mots ont-ils des seuils DIFFÉRENTS ?** (une gradation, pas une frontière
   vrai/faux, c'est la règle établie le 2026-08-11)
3. **Ces mots sont-ils lisibles dans le `product_name` d'OFF ?**

---

## D'abord, recalage du chiffre de départ

Les 5 familles livrées ne pèsent pas 1,7 % du rayon : elles pèsent **6,03 %**
(181 produits sur 3000, tags exacts, le piège `en:sardines-in-olive-oil` écarté).

| Famille livrée | Part du rayon | Déclenchement mesuré (mémoire) |
|---|---|---|
| Jus & nectars | 1,73 % | non mesuré |
| Poudres chocolatées | 1,37 % | 18,8 % |
| Jambons cuits | 1,07 % | 35,2 % |
| Confitures & marmelades | 1,03 % | 61,3 % |
| Huiles d'olive | 0,83 % | non mesuré |
| **Union** | **6,03 %** | |

Les deux chiffres sont compatibles : 6,03 % de présence × ~30 % de rangs
réellement certains ≈ 1,8 % d'écrans qui affichent un barème. **1,7 % était donc
la couverture EFFECTIVE, pas la part du rayon.** Je garde cette convention
ci-dessous : « couverture » = part du rayon × mentions lisibles.

---

## Le tableau

### Familles retenues, la loi gradue et OFF le laisse lire

| Famille | Mentions, du moins au plus exigeant | Seuils | Mention lue dans le nom | Rang dominant | Part du rayon | Couverture |
|---|---|---|---|---|---|---|
| **Glaces & sorbets** | glace à l'eau · **glace** · glace au lait · crème glacée · glace aux fruits · sorbet · sorbet plein fruit | 12 % d'extrait sec · *aucune MG laitière exigée* · 2,5 % MG laitière + 6 % ESDL · **5 % MG exclusivement laitière** · 15 % de fruits · 25 % de fruits · 45 % de fruits | 44,9 % (271/604) | 57,9 % | 0,23 % | **0,10 %** |
| **Crèmes de lait** | crème légère · crème · crème fraîche | 12 à 30 % MG · ≥ 30 % MG exclusivement laitière · + pasteurisée et ensemencée, jamais stérilisée | 78,0 % (448/574) | 37,1 % | 0,63 % | **0,49 %** |
| **Compotes & purées** | dessert de fruits · spécialité · compote allégée · compote · purée de fruits | *rien* · *rien* · −30 % de sucres · ≥ 24 g de sucres/100 g · fruits tamisés, sucre facultatif | 52,6 % (366/696) | 59,6 % | 0,40 % | **0,21 %** |
| **Foie gras** | spécialité/gourmandise · mousse, pâté, galantine · parfait · bloc · bloc avec morceaux · foie gras · foie gras entier | *rien* · 50 % · 75 % · 100 % reconstitué · + 30 % de morceaux · lobes agglomérés · lobes entiers | **94,6 %** (566/598) | 45,8 % | **0,00 %** | ≈ 0 % |

**Total ajouté : ~0,80 %.** L'app passerait d'environ 1,7 % à environ 2,5 % de
couverture effective.

Notes de lecture :

- **Glaces**, c'est la famille la plus proche de la mission. « Glace » tout court
  n'exige **aucune matière grasse laitière** : le Code autorise n'importe quelle
  matière grasse alimentaire, y compris exclusivement végétale. « Crème glacée »
  en exige 5 %, exclusivement laitières. Un rayon entier joue sur cet écart, et
  ma mesure le confirme : 157 fiches disent « glace », 52 disent « crème glacée ».
  Le prix à payer : **333 fiches sur 604 ne portent aucune dénomination**
  (« Magnum Amande », « Extrême original »), la marque a mangé le mot.
- **Crèmes**, meilleur étalement mesuré de toutes les familles testées (rang
  dominant 37,1 %, contre 92,6 % pour la charcuterie). « Crème légère » descend
  jusqu'à 12 % de MG là où « crème » en garantit 30. ⚠️ Le pourcentage est déjà
  obligatoire sur l'étiquette des crèmes légères : l'app n'apprendrait pas le
  chiffre, elle apprendrait ce que le MOT couvre.
- **Compotes**, la gradation existe mais elle est **inversée** : le mot le plus
  réglementé (« compote ») garantit un **minimum de sucres**, pas un minimum de
  fruits. « Dessert de fruits » et « spécialité » ne garantissent rien du tout et
  pèsent 65 fiches sur 366. Phrase honnête possible : *« compote » garantit au
  moins 24 g de sucres pour 100 g ; « dessert de fruits » ne garantit rien.*
- **Foie gras**, la plus belle échelle de tout l'inventaire (7 rangs, seuils
  chiffrés dans un décret, 94,6 % de noms lisibles) et **zéro produit dans les
  3000 les plus scannés**. Saisonnier, français, jamais scanné. À coder seulement
  si le coût est nul (~20 min) et sans jamais le compter dans la couverture.

### Familles écartées, avec le chiffre qui les tue

| Famille | Part du rayon | Ce qui échoue | Mesure |
|---|---|---|---|
| Biscuits | **10,67 %** | Q1 : « pur beurre » est la seule mention définie, et c'est une frontière, pas une échelle | 13 fiches sur 899 la portent (1,4 %) |
| Yaourts & laits fermentés | **10,43 %** | Q3 puis Q2 | 32,3 % de noms classables, dont **86,3 % au même rang** |
| Pains | **7,73 %** | Q3 : « pain de tradition française » est une mention de comptoir, pas d'emballage | **1 fiche sur 600** |
| Mayonnaises & sauces | **6,20 %** | Q2 : « sauce type mayonnaise » existe mais ne gradue rien | 84,2 % au même rang |
| Matières grasses à tartiner | **3,67 %** | Q3 : les grades du règlement UE (trois-quarts, demi) sont absents des noms | **0 fiche sur 1145** porte « trois-quarts » ou « demi-beurre » |
| Sirops | 0,80 % | Q2 : un seul mot réglementé | 95,4 % au même rang |
| Soupes | 0,67 % | Q2 : « velouté » désigne une texture, aucun seuil ne le sépare de « soupe » | code de bonnes pratiques 2008, aucun chiffre |
| Cafés | 0,63 % | Q1 : « arabica » est une espèce botanique, pas un grade légal | non mesuré |
| Vinaigres balsamiques | 0,33 % | Q3 : le mot qui trahit (« condiment ») n'est presque jamais écrit | **3 fiches sur 981** |
| Charcuterie (pâtés, rillettes, saucissons) | 0,27 % | Q2 : « supérieur » existe mais ne partage rien | 33 sur 1111, **92,6 % au même rang** |
| Produits panés | 0,20 % | Q1/Q2 : le 70 % de chair est une spécification de marché public, pas une dénomination | non mesuré |
| Viandes hachées | **0,00 %** | Q3 : la viande fraîche n'est quasi pas dans OFF | 15,4 % de noms classables |

⚠️ **Sur le balsamique**, la raison est plus subtile que le chiffre : « condiment
balsamique » n'est pas un rang inférieur. Le mot désigne aussi bien un produit
bas de gamme qu'un 100 % moût vieilli 4 ans, meilleur que l'IGP. Un mot qui peut
signifier les deux extrêmes ne garantit rien, l'app ne peut rien en dire, même
si les fabricants l'écrivaient.

---

## Ce que l'inventaire répond vraiment

**Le plafond est bas, et sa cause est structurelle.**

Les six plus gros rayons mesurés, biscuits 10,7 %, yaourts 10,4 %, pains 7,7 %,
sauces 6,2 %, matières grasses 3,7 %, céréales du petit-déjeuner 7,6 %, n'ont
**aucun vocabulaire gradué**. Ce n'est pas un oubli du législateur : la loi n'a
nommé que les produits **traditionnels dont une imitation moins chère existait
déjà** quand le texte a été écrit, confiture, jus, jambon, beurre, glace, foie
gras. Toute la croissance de l'industrie s'est faite dans des catégories que la
loi n'a jamais nommées, et où il n'y a donc **rien à décoder**.

Autrement dit : le barème est bien le seul point fixe de l'app, mais **il ne
grandira plus beaucoup**. Après cet inventaire, il ne reste plus de famille à
trouver, j'ai passé en revue les 14 plus gros rayons et les 6 pièges classiques.

**Ce que je recommande**, dans l'ordre de rapport bénéfice/coût :

1. **Glaces & sorbets**, la seule famille où l'écart entre deux mots est
   exactement la mission (« glace » = graisse végétale autorisée, « crème glacée »
   = 5 % de MG laitière). 0,10 % de couverture, mais le cas le plus parlant du
   rayon.
2. **Crèmes de lait**, meilleur étalement mesuré, 0,49 % de couverture, la plus
   grosse des quatre.
3. **Compotes**, cheap, adjacente à la confiture déjà codée, mais accepter que
   le message soit « ce mot garantit du sucre ».
4. **Foie gras**, seulement si c'est gratuit. Zéro scan.

Et surtout : **ne pas relancer** les douze familles du second tableau. Chacune
porte son chiffre.

---

## Sources des seuils

- **Glaces** : Code des pratiques loyales des glaces alimentaires, CNGF/SFIG,
  4 mars 2008, points 2.3.1 à 2.3.8 et annexes I et II (texte intégral lu).
- **Foie gras** : décret n° 93-999 du 9 août 1993 relatif aux préparations à base
  de foie gras.
- **Crèmes** : décret n° 80-313 du 23 avril 1980 relatif aux crèmes de lait
  destinées à la consommation.
- **Compotes** : code des usages des compotes (accès payant, les seuils cités
  proviennent de sources secondaires concordantes, à revérifier avant de coder).
- **Balsamique** : règlement (CE) n° 583/2009 (IGP Aceto Balsamico di Modena).
- **Soupes** : Code français de bonnes pratiques pour les soupes, bouillons et
  consommés, 2008 (FEDALIM).

⚠️ Rappel de la décision du 2026-08-11 : **aucun texte n'est cité à l'écran**, et
les seuils UE/France s'appliquent même aux utilisatrices canadiennes.
