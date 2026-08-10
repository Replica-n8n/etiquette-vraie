// Moteur de règles - Étiquette Vraie
// Détecte les incohérences entre le nom d'un produit et sa composition réelle.

function stripAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');
}

function normalize(str) {
  return stripAccents(str || '')
    .toLowerCase()
    // Open Food Facts encadre les ALLERGÈNES de tirets bas : "_cacahuètes_".
    // En expression régulière, "_" est un caractère de MOT : \bcacahuetes\b ne
    // correspond donc pas à "cacahuetes_", et le moteur concluait à l'absence.
    // Tout produit dont l'aliment promis est un allergène - beurre de
    // cacahuète, lait d'amande, pain de blé, yaourt au soja - était accusé de
    // ne pas le contenir. On remplace par une espace, pas par du vide, sinon
    // "_ble_complet" deviendrait "blecomplet".
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NON_CONFORME_PATTERNS = [
  {
    pattern: /preparation fromagere|specialite fromagere|specialite laitiere/,
    label: 'préparation fromagère / spécialité laitière',
    headline: (label) => `"${label}" - ne respecte pas les critères légaux du fromage`,
    legalNote:
      'Cette dénomination signale par construction un produit qui ne respecte pas le taux minimal de matière grasse laitière ou les critères légaux du fromage. Fiches DGCCRF sur les denrées alimentaires.',
    compareSuggest: 'Fromage',
    compareReal: 'Critères légaux du fromage non respectés',
  },
  {
    pattern: /preparation a base de miel/,
    label: 'préparation à base de miel',
    headline: (label) => `"${label}" - très faible taux de miel réel`,
    legalNote:
      'Cette dénomination signale par construction un très faible taux de miel réel, insuffisant pour la dénomination légale "miel". Fiches DGCCRF sur les denrées alimentaires.',
    compareSuggest: 'Miel',
    compareReal: 'Très faible taux de miel réel',
  },
  {
    pattern: /similaire au jambon|preparation a base de viande/,
    label: 'préparation à base de viande / similaire au jambon',
    headline: (label) => `"${label}" - non conforme à la dénomination jambon`,
    legalNote:
      'Cette dénomination signale par construction une non-conformité aux critères légaux de la dénomination "jambon". Fiches DGCCRF sur les denrées alimentaires.',
    compareSuggest: 'Jambon',
    compareReal: 'Non conforme à la dénomination jambon',
  },
];

// Expressions / jeux de mots français où un mot d'aliment est FIGURÉ (pas une
// allégation sur la composition). Ex. "La Vie En Orange" (jeu de mot sur "la vie
// en rose"). Le produit n'affirme pas contenir l'aliment -> ne pas signaler.
// Patterns en forme normalisée (sans accents, minuscules).
const NON_LITERAL_EXPRESSIONS = [
  /\bla vie en \w+/,               // "La Vie En Orange"
  /\bpresser le citron\b/,
  /\bramener sa fraise\b/,
  /\btomber dans les pommes\b/,
  /\bhaut comme trois pommes\b/,
  /\bmi-figue mi-raisin\b/,
  /\bpour des prunes\b/,
  /\braconter des salades\b/,
  /\bla cerise sur le gateau\b/,
  /\bmettre du beurre dans les epinards\b/,
];

// Mots qui annoncent une SAVEUR. Leurs flexions sont écrites une par une, et
// l'ensemble est encadré de limites de mot au moment de l'emploi.
//
// ⚠️ Un simple radical ne suffit pas, et ça a coûté cher : "gout" se déclenchait
// à l'intérieur de "goûter" et de "gouttes". "Goûter aux raisins" (10 % de
// raisins secs) était marqué À vérifier avec le libellé « "er aux" est une
// saveur », et "Cookies aux gouttes de chocolat" (20 % de chocolat) était
// accusé sur « tes de ». Un simple \b en tête n'aurait rien changé : il faut
// une limite APRÈS le mot. D'où les flexions explicites plutôt que des
// radicaux, sinon "aromatisée" ne correspondrait plus.
const SAVEUR_WORDS = [
  'aromes?', 'aromas?',
  'aromatis(?:e|ee|es|ees|ant|ants|ante|antes)',
  'saveurs?', 'gouts?',
  'parfum(?:s|e|ee|es|ees)?',
  'essences?',
].join('|');

// Extrait l'aliment annoncé derrière une formule de saveur : "arôme de fraise",
// "à saveur de chocolat", "aromatisé à la vanille", "goût citron"...
// (Complète la détection directe par FOOD_WORDS, pour les formes fléchies.)
const FLAVOR_PATTERN = new RegExp(
  `\\b(?:${SAVEUR_WORDS}|extraits?|concentre(?:s|e|es|ees)?)\\b` +
  `\\s*(?:naturels?\\s*|artificiels?\\s*)?(?:de\\s+|d'|a la\\s+|au\\s+|aux\\s+)?` +
  `([a-z]+(?:\\s+[a-z]+)?)`,
  'g'
);

// Mots d'ingrédients/fruits assez identifiables pour qu'on les vérifie quand ils
// apparaissent tels quels dans le nom du produit (ex. "Blueberry Waffles"),
// même sans "saveur/goût" devant. Volontairement limité aux mots concrets et peu
// ambigus (fruits, arômes classiques) - pas les noms de marque ("Nutella").
const FOOD_WORDS = [
  'myrtille', 'blueberry', 'fraise', 'strawberry', 'framboise', 'raspberry',
  // "choco" : l'abréviation la plus courante sur les emballages ("choco-noisette",
  // "goût choco"). Sans elle, l'app ne voyait qu'une moitié de la promesse.
  'vanille', 'vanilla', 'chocolat', 'chocolate', 'chocolatey', 'choco', 'cacao', 'cocoa', 'noisette', 'hazelnut',
  'citron', 'lemon', 'orange', 'banane', 'banana', 'pomme', 'apple',
  'cerise', 'cherry', 'coco', 'coconut', 'caramel', 'cafe', 'coffee',
  'cannelle', 'cinnamon', 'mangue', 'mango', 'peche', 'peach',
  'pistache', 'pistachio', 'abricot', 'apricot', 'ananas', 'pineapple',
  'poire', 'pear', 'grenade', 'pomegranate', 'menthe', 'mint',
  'amande', 'almond', 'boeuf', 'beef', 'aubergine', 'eggplant',
  'cacahuete', 'peanut', 'arachide', 'soja', 'soy', 'soya',
  'lait', 'milk', 'oeuf', 'egg', 'sesame', 'sésame',
  'noix', 'nut', 'walnut', 'cajou', 'cashew', 'macadamia', 'lin', 'flax',
  'raisin', 'grape', 'kiwi', 'mure', 'blackberry', 'figue', 'fig',
  'datte', 'date', 'avocat', 'avocado', 'cranberry', 'canneberge', 'miel', 'honey',
  'avoine', 'oat',
  // Aliments souvent mis en avant dans un nom composé (et souvent imités).
  // ATTENTION : n'ajouter ici que des INGRÉDIENTS, jamais des catégories de
  // produit (fromage, beurre, crème, jambon, poulet...). La liste d'ingrédients
  // d'un fromage ne dit pas "fromage" mais "lait, ferments" : les inclure
  // ferait passer "Fromage blanc" pour un produit trompeur.
  'crabe', 'crab', 'praline', 'erable', 'maple', 'truffe', 'truffle',
  'crevette', 'shrimp', 'homard', 'lobster', 'safran', 'saffron',
  // Ceux-ci sont aussi des CATÉGORIES de produit : protégés par CATEGORY_WORDS,
  // qui empêche de conclure quand ils sont absents de leur propre liste.
  'fromage', 'cheese', 'beurre', 'butter', 'creme', 'cream',
  'jambon', 'ham', 'poulet', 'chicken', 'saumon', 'salmon', 'thon', 'tuna',
];
// Pattern created dynamically in findFlavorMention() to support plurals

// Famille des fruits à coque : sert aux termes génériques "noix" / "nut".
const NUT_FAMILY = [
  'noix', 'noisette', 'amande', 'almond', 'cacahuete', 'peanut', 'arachide',
  'cajou', 'cashew', 'pistache', 'pistachio', 'pecan', 'macadamia',
  'walnut', 'hazelnut', 'nut', 'noyer', 'pignon',
];

const INGREDIENT_VARIANTS = {
  'pistache': ['pistache', 'pistaches', 'pistachio', 'pistachios'],
  'pistachio': ['pistache', 'pistaches', 'pistachio', 'pistachios'],
  'ananas': ['ananas', 'pineapple', 'pineapples'],
  'pineapple': ['ananas', 'pineapple', 'pineapples'],
  'fraise': ['fraise', 'fraises', 'strawberry', 'strawberries'],
  'strawberry': ['fraise', 'fraises', 'strawberry', 'strawberries'],
  'chocolat': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  'chocolate': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  'cacao': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  'cocoa': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  // "chocolatey" (EN) = mot de réserve : on le rattache à la famille chocolat
  // pour aller chercher s'il y a du vrai chocolat dans les ingrédients.
  'chocolatey': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  // "choco" ne doit PAS être cherché tel quel dans les ingrédients (aucune
  // liste n'écrit "choco") : il pointe vers la vraie famille du chocolat.
  'choco': ['chocolat', 'chocolats', 'chocolate', 'chocolates', 'cacao', 'cacaos', 'cocoa'],
  'vanille': ['vanille', 'vanilla'],
  'vanilla': ['vanille', 'vanilla'],
  'noisette': ['noisette', 'noisettes', 'hazelnut', 'hazelnuts'],
  'hazelnut': ['noisette', 'noisettes', 'hazelnut', 'hazelnuts'],
  'menthe': ['menthe', 'menthes', 'mint', 'mints'],
  'mint': ['menthe', 'menthes', 'mint', 'mints'],
  'boeuf': ['boeuf', 'beef', 'beefs'],
  'beef': ['boeuf', 'beef', 'beefs'],
  'aubergine': ['aubergine', 'aubergines', 'eggplant', 'eggplants'],
  'eggplant': ['aubergine', 'aubergines', 'eggplant', 'eggplants'],
  'amande': ['amande', 'amandes', 'almond', 'almonds'],
  'almond': ['amande', 'amandes', 'almond', 'almonds'],
  'cacahuete': ['cacahuete', 'cacahuetes', 'peanut', 'peanuts', 'arachide', 'arachides'],
  'peanut': ['cacahuete', 'cacahuetes', 'peanut', 'peanuts', 'arachide', 'arachides'],
  'arachide': ['cacahuete', 'cacahuetes', 'peanut', 'peanuts', 'arachide', 'arachides'],
  'soja': ['soja', 'soy', 'soya', 'soybean', 'soybeans'],
  'soy': ['soja', 'soy', 'soya', 'soybean', 'soybeans'],
  'soya': ['soja', 'soy', 'soya', 'soybean', 'soybeans'],
  'lait': ['lait', 'milk', 'lactose', 'dairy'],
  'milk': ['lait', 'milk', 'lactose', 'dairy'],
  'oeuf': ['oeuf', 'oeufs', 'egg', 'eggs'],
  'egg': ['oeuf', 'oeufs', 'egg', 'eggs'],
  'sesame': ['sesame', 'sesames', 'sésame', 'sésames'],
  'sésame': ['sesame', 'sesames', 'sésame', 'sésames'],
  'walnut': ['noix', 'walnut', 'walnuts'],
  'cajou': ['cajou', 'cashew', 'cashews', 'noix de cajou'],
  'cashew': ['cajou', 'cashew', 'cashews', 'noix de cajou'],
  'macadamia': ['macadamia', 'macadamias', 'noix de macadamia'],
  'lin': ['lin', 'flax', 'graine de lin', 'lin'],
  'flax': ['lin', 'flax', 'graine de lin'],
  'raisin': ['raisin', 'raisins', 'grape', 'grapes'],
  'grape': ['raisin', 'raisins', 'grape', 'grapes'],
  'kiwi': ['kiwi', 'kiwis'],
  'mure': ['mure', 'mures', 'blackberry', 'blackberries'],
  'blackberry': ['mure', 'mures', 'blackberry', 'blackberries'],
  'figue': ['figue', 'figues', 'fig', 'figs'],
  'fig': ['figue', 'figues', 'fig', 'figs'],
  'datte': ['datte', 'dattes', 'date', 'dates'],
  'date': ['datte', 'dattes', 'date', 'dates'],
  'avocat': ['avocat', 'avocats', 'avocado', 'avocados'],
  'avocado': ['avocat', 'avocats', 'avocado', 'avocados'],
  'cranberry': ['cranberry', 'cranberries', 'canneberge', 'canneberges'],
  'canneberge': ['cranberry', 'cranberries', 'canneberge', 'canneberges'],
  'miel': ['miel', 'honey'],
  'honey': ['miel', 'honey'],
  'avoine': ['avoine', 'avoines', 'oat', 'oats'],
  'oat': ['avoine', 'avoines', 'oat', 'oats'],
  // "noix" (fr) et "nut" (en) sont des termes GÉNÉRIQUES de fruit à coque : une
  // barre "chocolat noir et noix" peut légitimement contenir cacahuètes,
  // amandes, noisettes... N'importe quel fruit à coque satisfait donc la
  // promesse (sinon on accuse à tort - cf. Nature Valley 0016000407619).
  'noix': NUT_FAMILY,
  'nut': NUT_FAMILY,
  // "praliné" = préparation à base de noisettes/amandes caramélisées : on
  // vérifie donc la présence d'un fruit à coque.
  'praline': NUT_FAMILY,
  // "surimi" est justement le SUBSTITUT de crabe : il ne doit pas compter
  // comme du vrai crabe (sinon "imitation crabe" ressortirait clean).
  'crabe': ['crabe', 'crabes', 'crab', 'crabs'],
  'crab': ['crabe', 'crabes', 'crab', 'crabs'],
  'erable': ['erable', 'erables', 'maple'],
  'maple': ['erable', 'erables', 'maple'],
  'truffe': ['truffe', 'truffes', 'truffle', 'truffles'],
  'truffle': ['truffe', 'truffes', 'truffle', 'truffles'],
  'fromage': ['fromage', 'fromages', 'cheese', 'cheeses'],
  'cheese': ['fromage', 'fromages', 'cheese', 'cheeses'],
  'beurre': ['beurre', 'beurres', 'butter'],
  'butter': ['beurre', 'beurres', 'butter'],
  'creme': ['creme', 'cremes', 'cream', 'creams'],
  'cream': ['creme', 'cremes', 'cream', 'creams'],
  'jambon': ['jambon', 'jambons', 'ham'],
  'ham': ['jambon', 'jambons', 'ham'],
  'poulet': ['poulet', 'poulets', 'chicken'],
  'chicken': ['poulet', 'poulets', 'chicken'],
  'saumon': ['saumon', 'saumons', 'salmon'],
  'salmon': ['saumon', 'saumons', 'salmon'],
  'thon': ['thon', 'thons', 'tuna'],
  'tuna': ['thon', 'thons', 'tuna'],
  'crevette': ['crevette', 'crevettes', 'shrimp', 'shrimps', 'prawn', 'prawns'],
  'shrimp': ['crevette', 'crevettes', 'shrimp', 'shrimps', 'prawn', 'prawns'],
  'homard': ['homard', 'homards', 'lobster', 'lobsters'],
  'lobster': ['homard', 'homards', 'lobster', 'lobsters'],
  'safran': ['safran', 'saffron'],
  'saffron': ['safran', 'saffron'],
};

// ===========================================================================
// PAIRES FR <-> EN
//
// POURQUOI CETTE STRUCTURE. Un mot ajouté à FOOD_WORDS sans son équivalent
// dans INGREDIENT_VARIANTS produit une ACCUSATION FAUSSE : isMentionedInIngredients
// retombe alors sur [mot] et cherche "pomme" dans "apples, water, sugar".
// C'est arrivé sur 30 mots, dont pomme, citron, banane, cerise et framboise -
// "Compote de pommes" avec des ingrédients en anglais était déclaré trompeur.
// Le cas est courant : Open Food Facts ne stocke souvent qu'une seule langue.
//
// Ici, déclarer une paire alimente À LA FOIS FOOD_WORDS et INGREDIENT_VARIANTS.
// On ne PEUT plus ajouter un aliment sans sa traduction.
//
// N'ajouter que des INGRÉDIENTS, jamais des catégories de produit (yaourt,
// pain, biscuit) : leur liste d'ingrédients ne les nomme pas.
// Les pluriels sont gérés par pluralPattern() - inutile de les écrire.
// ===========================================================================
const FOOD_PAIRS = [
  // -- Correspondances MANQUANTES sur des mots déjà présents (le bug ci-dessus)
  ['pomme', 'apple'], ['citron', 'lemon'], ['banane', 'banana'],
  ['cerise', 'cherry'], ['framboise', 'raspberry'], ['myrtille', 'blueberry'],
  ['mangue', 'mango'], ['peche', 'peach'], ['poire', 'pear'],
  ['abricot', 'apricot'], ['grenade', 'pomegranate'], ['cannelle', 'cinnamon'],
  ['cafe', 'coffee'], ['coco', 'coconut'], ['orange'], ['caramel'],

  // -- Légumes
  ['tomate', 'tomato'], ['carotte', 'carrot'], ['oignon', 'onion'],
  ['ail', 'garlic'], ['epinard', 'spinach'], ['courgette', 'zucchini'],
  ['brocoli', 'broccoli'], ['champignon', 'mushroom'],
  // "maize" est la forme britannique de "corn" : les Corn Flakes de Kellogg's
  // listent "Maize", et étaient donc accusés de ne pas contenir de maïs.
  ['mais', 'corn', 'maize'],
  ['betterave', 'beet'], ['concombre', 'cucumber'], ['chou', 'cabbage'],
  ['celeri', 'celery'], ['poireau', 'leek'], ['olive'],
  ['citrouille', 'pumpkin'], ['poivron'],
  // "Patate" et "pomme de terre" sont le même aliment, et c'est la SECONDE
  // forme qu'emploient les listes d'ingrédients françaises. Sans elle, "Chips
  // de patates" composées de "pommes de terre" était déclaré TROMPEUR.
  // Les deux formes composées sont écartées de la détection dans les NOMS
  // (NAME_DETECTION_BLOCKLIST) : c'est COMPOUND_TRAPS qui s'en charge, parce
  // que nameFormPattern ne sait pas former le pluriel "pommeS de terre".
  ['patate', 'potato', 'pomme de terre', 'pommes de terre'],

  // -- Légumineuses
  ['pois chiche', 'chickpea'], ['lentille', 'lentil'], ['haricot', 'bean'],
  ['pois', 'pea'], ['feve', 'fava'],

  // -- Poissons et fruits de mer
  ['sardine'], ['anchois', 'anchovy'], ['maquereau', 'mackerel'],
  ['morue', 'cod'], ['truite', 'trout'], ['hareng', 'herring'],
  ['moule', 'mussel'], ['huitre', 'oyster'], ['calmar', 'squid'],

  // -- Viandes
  ['porc', 'pork'], ['dinde', 'turkey'], ['canard', 'duck'],
  ['agneau', 'lamb'], ['veau', 'veal'], ['bacon'],

  // -- Céréales
  ['ble', 'wheat'], ['riz', 'rice'], ['seigle', 'rye'], ['orge', 'barley'],
  ['epeautre', 'spelt'], ['quinoa'], ['sarrasin', 'buckwheat'], ['millet'],

  // -- Fruits
  ['pasteque', 'watermelon'], ['melon'], ['pamplemousse', 'grapefruit'],
  ['mandarine', 'tangerine'], ['clementine'], ['prune', 'plum'],
  ['papaye', 'papaya'], ['litchi', 'lychee'], ['cassis', 'blackcurrant'],
  ['groseille', 'redcurrant'], ['rhubarbe', 'rhubarb'], ['nectarine'],

  // -- Fruits à coque
  ['pecan'], ['chataigne', 'chestnut'], ['marron'],

  // -- Épices et aromates
  ['gingembre', 'ginger'], ['curcuma', 'turmeric'], ['basilic', 'basil'],
  ['romarin', 'rosemary'], ['thym', 'thyme'], ['origan', 'oregano'],
  ['persil', 'parsley'], ['coriandre', 'coriander'], ['aneth', 'dill'],
  ['piment', 'chili'], ['paprika'], ['cumin'], ['muscade', 'nutmeg'],
  ['girofle', 'clove'], ['cardamome', 'cardamom'], ['lavande', 'lavender'],
  ['anis', 'anise'], ['reglisse', 'licorice'], ['poivre', 'pepper'],

  // -- Divers
  ['tournesol', 'sunflower'], ['tofu'], ['sirop', 'syrup'],

  // =========================================================================
  // Deuxième passe, vérifiée contre la taxonomie d'ingrédients d'Open Food
  // Facts (6 477 entrées, 4 053 avec nom FR et EN) - c'est-à-dire le
  // vocabulaire exact des données que l'app lit.
  // Critère de sélection : un aliment qu'un NOM DE PRODUIT peut promettre et
  // qu'un fabricant a intérêt à remplacer par moins cher.
  // Volontairement EXCLUS : les catégories de produit (pain, biscuit, sauce,
  // jus, purée) et les charges bon marché (eau, sucre, farine, amidon,
  // sirop de glucose) - un nom ne promet jamais de l'eau. Ces dernières
  // relèvent d'une détection à part.
  // =========================================================================

  // -- Poissons et fruits de mer nobles (souvent remplacés par du pangasius,
  //    du colin ou du surimi)
  ['eglefin', 'haddock'], ['fletan', 'halibut'], ['merlu', 'hake'],
  ['espadon', 'swordfish'], ['dorade', 'seabream'], ['merlan', 'whiting'],
  ['merou', 'grouper'], ['turbot'], ['sole'], ['lotte', 'monkfish'],
  ['seiche', 'cuttlefish'], ['poulpe', 'octopus'], ['palourde', 'clam'],
  ['ecrevisse', 'crayfish'], ['ormeau', 'abalone'],
  ['cabillaud'], ['colin'], ['tilapia'], ['pangasius'], ['surimi'],

  // -- Viandes (le scandale de la viande de cheval reste le cas d'école)
  ['lapin', 'rabbit'], ['caille', 'quail'], ['oie', 'goose'],
  ['mouton', 'sheep'], ['chevre', 'goat'], ['cheval', 'horse'],
  ['biche', 'venison'], ['sanglier', 'boar'], ['lardon', 'lardons'],

  // -- Fromages nommés : très substitués par des "préparations fromagères"
  ['parmesan'], ['mozzarella'], ['feta'], ['ricotta'], ['mascarpone'],
  ['emmental'], ['comte'], ['brie'], ['gorgonzola'], ['roquefort'],
  ['halloumi'], ['provolone'], ['pecorino'], ['cheddar'], ['gruyere'],

  // -- Légumes
  ['navet', 'turnip'], ['artichaut', 'artichoke'], ['asperge', 'asparagus'],
  ['choufleur', 'cauliflower'], ['echalote', 'shallot'], ['fenouil', 'fennel'],
  ['radis', 'radish'], ['laitue', 'lettuce'], ['panais', 'parsnip'],
  ['blette', 'chard'], ['igname', 'yam'], ['manioc', 'cassava'],
  ['gombo', 'okra'], ['rutabaga'], ['cresson', 'cress'], ['roquette', 'rocket'],
  ['choucroute', 'sauerkraut'], ['salsifis', 'salsify'], ['edamame'],

  // -- Champignons (le cèpe et la morille valent dix fois le champignon de Paris)
  ['cepe', 'cep'], ['morille', 'morel'], ['shiitake'], ['portobello'],
  ['girolle', 'chanterelle'], ['truffe', 'truffle'],

  // -- Fruits
  ['goyave', 'guava'], ['kaki', 'persimmon'], ['coing', 'quince'],
  ['acerola'], ['tamarin', 'tamarind'], ['carambole', 'carambola'],
  ['airelle', 'lingonberry'], ['sureau', 'elder'], ['pomelo'],
  ['bergamote', 'bergamot'], ['grenadille', 'passionfruit'], ['physalis'],

  // -- Aromates et épices
  ['estragon', 'tarragon'], ['sauge', 'sage'], ['ciboulette', 'chives'],
  ['marjolaine', 'marjoram'], ['fenugrec', 'fenugreek'],
  ['citronnelle', 'lemongrass'], ['raifort', 'horseradish'], ['wasabi'],
  ['sumac'], ['genievre', 'juniper'], ['macis', 'mace'], ['pavot', 'poppy'],
  ['carvi', 'caraway'], ['cerfeuil', 'chervil'], ['galanga', 'galangal'],

  // -- Céréales, graines, féculents
  ['semoule', 'semolina'], ['sorgho', 'sorghum'], ['chanvre', 'hemp'],
  ['tapioca'], ['boulghour', 'bulgur'], ['malt'],
  ['sesame'], ['chia'],

  // -- Produits chers, cibles classiques de la contrefaçon
  ['miso'], ['massepain', 'marzipan'], ['nougat'], ['melasse', 'molasses'],
  ['ghi', 'ghee'], ['babeurre', 'buttermilk'], ['propolis'],
  ['matcha'], ['guarana'], ['spiruline', 'spirulina'],
];

// Mots trop ambigus pour être CHERCHÉS DANS UN NOM, mais qu'il faut savoir
// traduire quand on les cherche dans des ingrédients.
//   'ail'  : nameFormPattern en dérive "ailes" -> "Ailes de poulet" aurait été
//            accusé de ne pas contenir d'ail.
//   'mais' : normalize() transforme "maïs" en "mais", indiscernable de la
//            conjonction française.
// Ils restent dans INGREDIENT_VARIANTS : "Garlic Sauce" avec des ingrédients
// français trouve bien "ail".
//   'pomme(s) de terre' : formes composées présentes pour les INGRÉDIENTS.
//            Dans un nom, c'est COMPOUND_TRAPS qui les reconnaît, en une seule
//            expression régulière capable du pluriel français ("pommeS de
//            terre"), que nameFormPattern ne sait pas produire.
const NAME_DETECTION_BLOCKLIST = new Set([
  'ail', 'mais', 'pomme de terre', 'pommes de terre',
]);

// Fusion : chaque forme rejoint FOOD_WORDS et pointe vers toutes ses soeurs.
for (const formes of FOOD_PAIRS) {
  for (const forme of formes) {
    if (!FOOD_WORDS.includes(forme) && !NAME_DETECTION_BLOCKLIST.has(forme)) {
      FOOD_WORDS.push(forme);
    }
    INGREDIENT_VARIANTS[forme] = [...new Set([
      ...(INGREDIENT_VARIANTS[forme] || []), ...formes,
    ])];
  }
}

// Mots composés dont un morceau est un autre aliment. "Pomme de terre" n'est
// pas une pomme : sans cette exclusion, des chips dont les ingrédients disent
// "potatoes" seraient accusées de ne pas contenir de pomme.
// `add` remplace l'aliment retiré par celui que le composé désigne VRAIMENT.
// Sans lui, retirer "pomme" ne laissait aucun mot à vérifier et "Purée de
// pommes de terre" ressortait "Rien à vérifier" - alors que le nom promet bien
// un aliment, présent et vérifiable.
const COMPOUND_TRAPS = [
  { pattern: /\bpommes? de terre\b/, drop: 'pomme', add: 'patate' },
  { pattern: /\bpommes? d'amour\b/, drop: 'pomme' },
  { pattern: /\bbeurre de pomme\b/, drop: 'beurre' },
];

// Affichage en français des mots détectés : normalize() enlève les accents,
// donc "chocolaté" devient "chocolate", qui a l'air anglais à l'écran. On
// réaffiche le mot français attendu par l'utilisateur.
const DISPLAY_FR = {
  chocolate: 'chocolat', chocolatey: 'chocolat', chocolates: 'chocolat', choco: 'chocolat', cocoa: 'cacao',
  strawberry: 'fraise', raspberry: 'framboise', blueberry: 'myrtille',
  blackberry: 'mûre', cranberry: 'canneberge', cherry: 'cerise', apple: 'pomme',
  banana: 'banane', lemon: 'citron', peach: 'pêche', pear: 'poire',
  pineapple: 'ananas', apricot: 'abricot', mango: 'mangue', grape: 'raisin',
  vanilla: 'vanille', hazelnut: 'noisette', almond: 'amande', walnut: 'noix',
  peanut: 'cacahuète', cashew: 'noix de cajou', pistachio: 'pistache',
  coconut: 'noix de coco', honey: 'miel', mint: 'menthe', cinnamon: 'cannelle',
  coffee: 'café', milk: 'lait', egg: 'oeuf', beef: 'boeuf', eggplant: 'aubergine',
  oat: 'avoine', oats: 'avoine', nut: 'fruit à coque', soy: 'soja', fig: 'figue',
  date: 'datte', avocado: 'avocat', pomegranate: 'grenade',
  // Le moteur raisonne sur "patate", mais c'est "pomme de terre" qui est écrit
  // sur l'emballage : on affiche le mot que l'acheteuse a sous les yeux.
  patate: 'pomme de terre', potato: 'pomme de terre',
  // Le dictionnaire est écrit SANS ACCENTS, parce que normalize() en retire
  // pour comparer. À l'affichage il en faut : on écrivait "cacahuete", "peche",
  // "chevre". Invisible tant que l'app ne nommait que l'aliment promis, criant
  // depuis qu'elle nomme aussi le remplaçant.
  cacahuete: 'cacahuète', eglefin: 'églefin', fletan: 'flétan', merou: 'mérou',
  chevre: 'chèvre', ecrevisse: 'écrevisse', huitre: 'huître', pecan: 'pécan',
  peche: 'pêche', cepe: 'cèpe', feve: 'fève', celeri: 'céleri', peches: 'pêche',
  epeautre: 'épeautre', sesame: 'sésame', reglisse: 'réglisse', melasse: 'mélasse',
  chataigne: 'châtaigne', gruyere: 'gruyère', comte: 'comté', pasteque: 'pastèque',
  genievre: 'genièvre', echalote: 'échalote', asperge: 'asperge', mure: 'mûre',
  oeuf: 'œuf', ble: 'blé', cafe: 'café', erable: 'érable', pate: 'pâte',
};

function displayFlavor(word) {
  return DISPLAY_FR[word] || word;
}

// Table des formes rencontrées dans un nom -> mot de base, construite une fois.
// Le premier gagne : "chocolate" (forme de "chocolat") pointe donc sur
// "chocolat", et les deux appartiennent de toute façon à la même famille.
const NAME_FORM_TO_BASE = (() => {
  const map = {};
  for (const word of FOOD_WORDS) {
    for (const form of nameFormPattern(word).split('|')) {
      if (!(form in map)) map[form] = word;
    }
  }
  return map;
})();

const FOOD_WORD_PATTERN = new RegExp(
  `\\b(${FOOD_WORDS.map(w => nameFormPattern(w)).join('|')})\\b`, 'g'
);

function findFlavorMention(productName) {
  // Exclure les produits "Chocolate X%", "Dark Chocolate Y%", etc.
  if (/chocolate.+\d+\s*%/i.test(productName)) {
    return [];
  }

  const nameNorm = normalize(productName);
  const flavors = new Set();

  // Cherche toutes les saveurs "saveur X", "goût X", "parfum X".
  // La capture peut ramener deux mots ("chocolat au blé") ou un mot inconnu
  // ("barbecue"). On ne retient que ce qui est un ALIMENT CONNU, sinon on se
  // tait : sans entrée au dictionnaire, on n'a pas ses traductions, et
  // isMentionedInIngredients irait chercher le mot brut dans les ingrédients -
  // le mécanisme exact des fausses accusations que les paires FR/EN évitent.
  // "Prince Goût Chocolat au blé complet" capturait "chocolat au", introuvable
  // par construction, donc accusé à coup sûr.
  const explicitMatches = nameNorm.matchAll(FLAVOR_PATTERN);
  for (const match of explicitMatches) {
    const capture = match[1].trim();
    const base = NAME_FORM_TO_BASE[capture] || NAME_FORM_TO_BASE[capture.split(/\s+/)[0]];
    if (base) flavors.add(base);
  }

  // Cherche tous les FOOD_WORDS dans le nom - pluriels ET formes adjectivales
  const directMatches = nameNorm.matchAll(FOOD_WORD_PATTERN);
  for (const match of directMatches) {
    // Toujours retenir le mot de BASE : "chocolatee" -> "chocolat", sinon la
    // recherche dans les ingrédients (INGREDIENT_VARIANTS) ne trouverait rien.
    const form = match[1].trim();
    flavors.add(NAME_FORM_TO_BASE[form] || form);
  }

  // "Pomme de terre" contient "pomme" sans en être une - mais c'est une patate.
  for (const trap of COMPOUND_TRAPS) {
    if (!trap.pattern.test(nameNorm)) continue;
    flavors.delete(trap.drop);
    if (trap.add) flavors.add(trap.add);
  }

  return Array.from(flavors);
}

// Variante(s) plurielles d'un mot, pour matcher "fraise"/"fraises" mais aussi
// "blueberry"/"blueberries" (pluriel anglais en -y -> -ies).
function pluralPattern(word) {
  // Le "s" simple ne suffit pas en anglais : peach -> peachES, tomato ->
  // tomatoES, potato -> potatoES. Sans cette forme, "Yaourt pêche" cherchait
  // "peach|peachs" dans "milk, peaches, sugar" et n'y trouvait rien.
  // Les formes inventées (sardinees) ne gênent pas : ce sont des alternatives
  // d'une expression régulière, elles ne matchent simplement jamais.
  // Le pluriel français en -X manquait aussi : poireau -> poireauX, chou ->
  // chouX. "Velouté poireau et pomme de terre" (3760325480433) était accusé de
  // ne pas contenir de poireau alors que "Poireaux" ouvre sa liste.
  // Les formes inventées (selx, laitx) ne gênent pas : ce sont des alternatives
  // d'une expression régulière, elles ne correspondent simplement jamais.
  const alternatives = [word, `${word}s`, `${word}es`, `${word}x`];
  if (word.endsWith('y')) alternatives.push(`${word.slice(0, -1)}ies`);
  return alternatives.join('|');
}

// Formes rencontrées dans un NOM de produit : pluriels + adjectifs français.
// "Barre CHOCOLATÉE" devient "chocolatee" après normalize() et ne correspondait
// donc à aucun aliment : la saveur n'était même pas détectée, et le produit
// ressortait "clean". Idem "crème vanillée" -> "vanillee", "biscuit citronné"
// -> "citronne". On accepte donc le mot suivi des terminaisons d'adjectif.
// Réservé au NOM : dans les ingrédients, on garde la correspondance stricte.
function nameFormPattern(word) {
  const forms = new Set([word, `${word}s`, `${word}x`]);
  if (word.endsWith('y')) forms.add(`${word.slice(0, -1)}ies`);
  for (const suffix of ['e', 'ee', 'es', 'ees', 'ne', 'nee', 'nes', 'nees']) {
    forms.add(word + suffix);
  }
  return [...forms].join('|');
}

// ===========================================================================
// MARQUEURS DE SAVEUR - l'aveu que l'ingrédient noble n'est pas là
// ---------------------------------------------------------------------------
// Source : ACIA, "Lignes directrices sur la mise en évidence d'ingrédients et
// de saveurs". Au Canada, un produit qui met un aliment en avant SANS le
// contenir doit porter « à saveur de » ou un équivalent. Ces mots sont donc
// l'aveu officiel du fabricant, en toutes lettres sur l'emballage.
//
// Piège évité : "arome" ne doit PAS attraper "aromatique" - des "herbes
// aromatiques" sont un vrai ingrédient. Les deux radicaux sont distincts
// (arome / aromatis vs aromatique), donc aucun chevauchement.
const FLAVOUR_MARKER = new RegExp([
  // arôme(s), aromatisé(e), saveur(s), goût(s), parfum(é), essence(s) - avec
  // limites de mot : sans elles, l'ingrédient réel "gouttes de chocolat" était
  // pris pour un marqueur de saveur, et le chocolat déclaré absent.
  `\\b(?:${SAVEUR_WORDS})\\b`,
  'artificiels?', 'artificial',  // « arôme artificiel »
  'imitation',
  'simul',                       // simulé / simulated
  'simili',                      // ACIA : « pizza au simili-crabe »
  'succedane',                   // succédané
  'flavou?r',                    // flavour / flavor / flavoured / flavouring
  // Adjectifs anglais en -y : décrivent un goût, pas une présence
  'chocolate?y', 'fruity', 'buttery', 'cheesy', 'creamy', 'nutty', 'minty', 'lemony',
].join('|'));

// Mots qui désignent aussi une CATÉGORIE de produit. La liste d'ingrédients
// d'un fromage ne répète pas "fromage" mais dit "lait, ferments" : leur absence
// ne prouve donc rien (sinon "Fromage blanc" passerait pour trompeur).
// Règle : absents de la liste -> on ne conclut rien ; mais s'ils y figurent
// accolés à un marqueur de saveur ("cheese flavour powder"), c'est bien une
// allégation de saveur, et là on signale.
const CATEGORY_WORDS = new Set([
  'fromage', 'cheese', 'beurre', 'butter', 'creme', 'cream',
  'jambon', 'ham', 'poulet', 'chicken', 'saumon', 'salmon',
  'thon', 'tuna', 'lait', 'milk', 'miel', 'honey',
  // Fromages NOMMÉS : même piège que "fromage". Une meule de cheddar a pour
  // ingrédients "lait, sel, ferments" - jamais "cheddar". Sans cette
  // protection, "Fromage cheddar fort" était déclaré trompeur.
  'parmesan', 'mozzarella', 'feta', 'ricotta', 'mascarpone', 'emmental',
  'comte', 'brie', 'gorgonzola', 'roquefort', 'halloumi', 'provolone',
  'pecorino', 'cheddar', 'gruyere',
  // La PATATE, pour une autre raison que les fromages : personne ne la truque.
  // C'est un féculent bon marché, jamais un ingrédient noble qu'on imite. En
  // face, le risque d'accuser à tort est réel : un sac de pommes de terre belge
  // dont la liste est en néerlandais ("Aardappelen", vu sur 5400141464344)
  // serait déclaré trompeur. Muette quand elle est absente, l'app signale
  // quand même "arôme de pomme de terre" - le seul cas qui vaut un avertissement.
  'patate', 'potato',
]);

// CATEGORY_WORDS répond à « faut-il conclure quand le mot est absent ? ».
// Une SECONDE question, différente : « peut-on afficher son pourcentage ? ».
// Pour les fromages et les matières grasses, non - "beurre" attrape le beurre
// de CACAO d'un chocolat, et le chiffre porterait sur autre chose que ce que
// le nom promet. Pour la patate, si : "pomme de terre 51 %" dans une purée
// veut exactement dire ce qu'il dit. Confondre les deux questions faisait
// disparaître le pourcentage du velouté poireau-pomme de terre.
const SHARE_BLOCKED_WORDS = new Set(
  [...CATEGORY_WORDS].filter((w) => w !== 'patate' && w !== 'potato')
);

// Le mot figure-t-il quelque part dans les ingrédients (peu importe le contexte) ?
function isMentionedInIngredients(word, ingredientsNorm) {
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  return new RegExp(`\\b(?:${variants})\\b`).test(ingredientsNorm);
}

// Vrai si le mot n'apparaît dans les ingrédients que comme saveur/arôme,
// jamais comme ingrédient réel. On raisonne par ingrédient (séparés par des
// virgules) : le marqueur peut précéder OU suivre le mot selon la langue.
function onlyAppearsAsArome(word, ingredientsNorm) {
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  const wordRe = new RegExp(`\\b(?:${variants})\\b`);
  const items = ingredientsNorm.split(',').map(s => s.trim()).filter(Boolean);
  const mentions = items.filter(item => wordRe.test(item));
  if (mentions.length === 0) return true; // absent = pareil qu'arôme seul
  return mentions.every(item => FLAVOUR_MARKER.test(item));
}

// ===========================================================================
// NOMMER LE SUBSTITUT
//
// « Filet de cabillaud » composé de pangasius affichait « "cabillaud" absent -
// seulement un arôme ». Il n'y a AUCUN arôme dans cette liste : le substitut
// est en première position, l'app l'a sous les yeux, et elle raconte une
// histoire d'arôme. Même chose pour « Lasagnes au bœuf » / viande de cheval et
// « Salade de crabe » / surimi. Le moteur savait dire ce qui MANQUE, jamais ce
// qu'on a mis à la place - c'est pourtant la question de l'acheteuse.
//
// La cause : `onlyAppearsAsArome` répond vrai dans DEUX situations très
// différentes - le mot est absent, ou il n'apparaît que dans un arôme - et le
// libellé ne connaissait que la seconde.
//
// ⚠️ On ne nomme un remplaçant que s'il est de la MÊME FAMILLE. C'est ce qui
// rend la phrase vraie : personne ne remplace du cabillaud par de la farine.
// Sans cette contrainte, « Biscuit fraise » sans fraise annoncerait « remplacé
// par farine de blé », ce qui n'a aucun sens.
const FAMILLES_SUBSTITUT = [
  ['poisson', [
    'cabillaud', 'morue', 'cod', 'colin', 'merlu', 'hake', 'merlan', 'whiting',
    'eglefin', 'haddock', 'fletan', 'halibut', 'sole', 'turbot', 'dorade',
    'seabream', 'merou', 'grouper', 'espadon', 'swordfish', 'lotte', 'monkfish',
    'saumon', 'salmon', 'truite', 'trout', 'thon', 'tuna', 'sardine',
    'maquereau', 'mackerel', 'anchois', 'anchovy', 'hareng', 'herring',
    'tilapia', 'pangasius',
  ]],
  ['viande', [
    'boeuf', 'beef', 'veau', 'veal', 'porc', 'pork', 'cheval', 'horse',
    'agneau', 'lamb', 'mouton', 'sheep', 'poulet', 'chicken', 'dinde', 'turkey',
    'canard', 'duck', 'lapin', 'rabbit', 'oie', 'goose', 'caille', 'quail',
    'chevre', 'goat', 'biche', 'venison', 'sanglier', 'boar', 'jambon', 'ham',
    'bacon', 'lardon',
  ]],
  ['fruits de mer', [
    'crabe', 'crab', 'crevette', 'shrimp', 'homard', 'lobster', 'surimi',
    'moule', 'mussel', 'huitre', 'oyster', 'calmar', 'squid', 'seiche',
    'cuttlefish', 'poulpe', 'octopus', 'palourde', 'clam', 'ecrevisse',
    'crayfish', 'ormeau', 'abalone',
  ]],
  // NUT_FAMILY moins ses termes GÉNÉRIQUES ('noix', 'nut') : ils désignent
  // n'importe quel fruit à coque, donc « amande remplacée par noix » quand le
  // sachet contient des noix de cajou. On nomme l'espèce ou on se tait.
  ['fruits à coque', [
    'noisette', 'hazelnut', 'amande', 'almond', 'cacahuete', 'peanut',
    'arachide', 'cajou', 'cashew', 'pistache', 'pistachio', 'pecan',
    'macadamia', 'pignon',
  ]],
];

// Un ingrédient TIRÉ de l'animal n'est pas l'animal. « Gélatine de porc » dans
// un plat au bœuf n'est pas du porc servi à la place du bœuf, c'est un liant :
// l'annoncer comme remplaçant serait une accusation fausse.
const DERIVE_MARKER = /\b(?:gelatine|bouillon|extrait|extract|graisse|fat|collagene|collagen|plasma|gelatin)\b/;

// L'aliment promis est absent : quel aliment de sa famille occupe la place ?
// On renvoie le PREMIER trouvé dans l'ordre de la liste - donc le plus lourd,
// puisque la liste est ordonnée par quantité décroissante (art. 18).
function findSubstitute(word, ingredientsNorm) {
  const famille = FAMILLES_SUBSTITUT.find(([, mots]) => mots.includes(word));
  if (!famille) return null;
  const candidats = famille[1].filter((m) => m !== word);
  for (const item of splitIngredientList(ingredientsNorm)) {
    if (FLAVOUR_MARKER.test(item) || DERIVE_MARKER.test(item)) continue;
    for (const c of candidats) {
      if (isMentionedInIngredients(c, item)) return c;
    }
  }
  return null;
}

// ===========================================================================
// RÉSERVES DANS LE NOM - le fabricant a prévenu
// ---------------------------------------------------------------------------
// Trois familles, à tester séparément car elles se construisent différemment.

// 1) Adjectifs français en -é : "chocolaté", "vanillé", "citronné"... Ils
//    décrivent un GOÛT, pas une présence.
//    IMPORTANT : on teste sur le nom BRUT (accentué). normalize() enlève les
//    accents, ce qui rendrait "vanillé" identique à "vanille" (le vrai
//    ingrédient) et "chocolaté" identique à l'anglais "chocolate".
//    On n'accepte donc QUE le é accentué : "beurré" oui, "beurre" non.
const HEDGE_ADJ_STEMS_FR = [
  'chocolat', 'vanill', 'citronn', 'menthol', 'pralin', 'beurr', 'fruit',
  'fromag', 'amand', 'noisett', 'miell', 'caramelis', 'caramélis', 'cacaot',
  'muscad', 'safran', 'truff', 'poivr', 'epic', 'épic',
];
// Drapeau 'i' indispensable : les emballages sont souvent en MAJUSCULES
// ("BARRE CHOCOLATÉE"). Le é reste obligatoire, donc "chocolate" (anglais,
// sans accent) ne déclenche pas la réserve.
const HEDGE_ADJ_FR = new RegExp(HEDGE_ADJ_STEMS_FR.map(s => s + '[éÉ]').join('|'), 'i');

// 2) Adjectifs anglais en -y : "chocolatey", "fruity", "buttery"...
const HEDGE_ADJ_EN = /\b(?:chocolate?y|fruity|buttery|cheesy|creamy|nutty|minty|lemony|berry)\b/i;

// 3) Réserves structurelles (les deux langues), sur le nom normalisé.
//    "façon", "type", "style", "imitation", "simili-" (formule ACIA)...
const HEDGE_STRUCTURAL = /\bfacon\b|\bmaniere de\b|\btype\b|\bstyle\b|\bgenre\b|\bimitation\b|simili|\bsubstitut|\bsimilaire\b|\bsuccedane|\blike\b|\bvegan\b/;

// 4) Mots de saveur explicites, sur le nom normalisé. Mêmes limites de mot :
//    "Goûter aux raisins" n'est pas une réserve, c'est un nom de biscuit.
const HEDGE_FLAVOUR_WORDS = new RegExp(
  `\\b(?:${SAVEUR_WORDS})\\b|artificiels?|artificial|flavou?r`
);

function hasHedgeWord(productName) {
  const raw = String(productName || '');
  if (HEDGE_ADJ_FR.test(raw)) return true;
  if (HEDGE_ADJ_EN.test(raw)) return true;
  const norm = normalize(raw);
  return HEDGE_STRUCTURAL.test(norm) || HEDGE_FLAVOUR_WORDS.test(norm);
}

// Pourcentage déclaré pour un ingrédient, s'il figure dans la liste.
// L'ACIA vise aussi le cas « présent en très faible concentration » : un
// "Barre framboise" à 2% de framboise est techniquement vrai, mais le nom
// promet beaucoup plus. On lit le % accolé au mot, avant OU après
// ("framboise 2%" comme "2% de framboise"), virgule ou point décimal.
function findIngredientPercent(word, ingredientsNorm) {
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  const after = new RegExp(`\\b(?:${variants})\\b[^,;()]{0,20}?(\\d+(?:[.,]\\d+)?)\\s*%`);
  const before = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*%[^,;()]{0,20}?\\b(?:${variants})\\b`);
  const match = after.exec(ingredientsNorm) || before.exec(ingredientsNorm);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

// En dessous de ce seuil, l'ingrédient mis en avant dans le nom relève
// davantage de l'aromatisation que de la recette.
const LOW_PERCENT_THRESHOLD = 5;

// DÉCOUPAGE D'UNE LISTE D'INGRÉDIENTS.
//
// Une virgule ne sépare pas toujours deux ingrédients. Découper bêtement sur
// chacune d'elles cassait deux choses, vues sur de vrais produits :
//   - les DÉCIMALES : "Farine de blé 59,4%" devenait "farine de ble 59" et
//     "4%". Ce second morceau, vidé par le nettoyage, disparaissait de la
//     liste affichée : toutes les lignes suivantes se décalaient d'un cran et
//     le surlignage désignait "farine de soja" au lieu des raisins.
//   - les PARENTHÈSES : "vanille en poudre (0,03%)" s'affichait sur deux
//     lignes, "vanille en poudre (" puis ")".
// Cette fonction sert à la fois au moteur et à l'affichage : c'est ce qui
// garantit que la ligne surlignée est bien celle que le moteur a repérée.
function splitIngredientList(text) {
  const items = [];
  const chaine = String(text || '');
  let courant = '';
  let profondeur = 0;
  for (let i = 0; i < chaine.length; i++) {
    const c = chaine[i];
    if (c === '(' || c === '[') profondeur++;
    else if (c === ')' || c === ']') profondeur = Math.max(0, profondeur - 1);
    const decimale = /\d/.test(chaine[i - 1] || '') && /\d/.test(chaine[i + 1] || '');
    if (c === ',' && profondeur === 0 && !decimale) {
      items.push(courant);
      courant = '';
      continue;
    }
    courant += c;
  }
  items.push(courant);
  return items.map((s) => s.trim()).filter(Boolean);
}

function findIngredientPosition(word, ingredientsNorm) {
  const items = splitIngredientList(ingredientsNorm);
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  const wordRe = new RegExp(`\\b(?:${variants})\\b`);
  const index = items.findIndex((item) => wordRe.test(item));
  if (index === -1) return null;
  return { index, total: items.length, ratio: (index + 1) / items.length };
}

const LEGAL_NOTE_POSITION =
  'L\'ordre de la liste d\'ingrédients doit refléter leur quantité décroissante (règlement (UE) n°1169/2011, art. 18). La position d\'un ingrédient est donc un signal fiable de sa proportion réelle.';

const LEGAL_NOTE_LOW_PERCENT =
  'L\'ingrédient mis en avant par le nom est bien présent, mais en très faible quantité. Les lignes directrices de l\'ACIA visent précisément ce cas : mettre un aliment en évidence alors qu\'il est "présent en très faible concentration" donne une fausse impression de sa quantité réelle. Le pourcentage affiché ici est celui déclaré par le fabricant lui-même dans la liste d\'ingrédients.';

// TEXTES LÉGAUX NOMMÉS.
//
// Ils étaient génériques et prenaient TOUJOURS le chocolat en exemple : devant
// un produit à la noisette, l'app expliquait une règle sur le beurre de cacao.
// On nomme donc l'aliment réellement concerné.
//
// ⚠️ Piège évité : la phrase sur le beurre de cacao n'est pas un exemple
// interchangeable, c'est un fait juridique PROPRE au chocolat (directive
// 2000/36/CE). La recopier avec "noisette" à la place écrirait une règle qui
// n'existe pas. Elle n'apparaît donc que quand le chocolat est en cause.

// "de noisette" mais "d'amande". Le h reste aspiré en français : on écrit
// bien "de homard", pas "d'homard".
function articleDe(mot) {
  return /^[aeiouyàâéèêîôûœ]/i.test(mot) ? `d'${mot}` : `de ${mot}`;
}

// "noisette", "noisette et chocolat", "noisette, amande et chocolat"
function enumerer(mots) {
  if (mots.length <= 1) return mots[0] || '';
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

const FAMILLE_CHOCOLAT = new Set(['chocolat', 'chocolate', 'chocolatey', 'choco', 'cacao', 'cocoa']);

// SOUS QUELLE FORME LE CHOCOLAT EST-IL LÀ ?
//
// Le moteur range chocolat et cacao dans la même famille, ce qui est bon pour
// répondre "présent ou absent". Mais ce ne sont pas la même chose : le
// chocolat, c'est la fève ENTIÈRE - la pâte et son beurre (directive
// 2000/36/CE). Le cacao en poudre est cette même fève dont on a retiré le
// beurre, la fraction la moins chère : il donne le goût, pas la matière.
//
// On n'en fait PAS une accusation : mesuré le 2026-08-08, cela ne concernerait
// que 3 produits sur 40, et la première version de la règle accusait "Taza
// Super Dark" (ingrédients : fèves de cacao, sucre) - le chocolat le plus
// honnête qui soit. On informe, l'acheteuse juge.
//
// ⚠️ La FÈVE compte comme du vrai chocolat. C'est la matière première, pas un
// succédané : l'oublier revient à accuser les chocolats bean-to-bar.
const CHOCO_FORMES_VRAIES = [
  ['chocolat', /\bchocolats?\b|\bchocolates?\b/],
  ['pâte de cacao', /pate de cacao|masse de cacao|cocoa mass|cocoa liquor|cacao liquor/],
  ['fèves de cacao', /feves? de cacao|cacao beans?|cocoa beans?|cocoa nibs?|grue de cacao/],
  ['beurre de cacao', /beurre de cacao|cocoa butter/],
];
// Du plus précis au plus vague : on retient le premier qui correspond.
const CHOCO_FORMES_POUDRE = [
  ['cacao maigre en poudre', /cacao maigre|fat.?reduced cocoa/],
  ['cacao alcalinisé', /alcalinise|processed with alkali/],
  ['cacao en poudre', /cacao en poudre|poudre de cacao|cocoa powder|cocoa solids/],
  ['cacao', /\bcacaos?\b|\bcocoa\b/],
];

// Annotation d'un aliment affiché. Seul le chocolat en a une pour l'instant :
// c'est le seul dont la loi tranche explicitement la forme, et le seul où la
// substitution par la fraction bon marché est un commerce à part entière.
// La structure accepte d'autres aliments sans changer d'affichage.
function formeTrouvee(mot, ingredientsNorm) {
  if (!FAMILLE_CHOCOLAT.has(mot)) return null;
  const forme = chocolateForm(ingredientsNorm);
  return forme ? { aliment: 'chocolat', ...forme } : null;
}

// ===========================================================================
// BARÈME LÉGAL : situer un produit dans SA famille
//
// Certaines dénominations sont réglementées et hiérarchisées : un jus, un
// nectar et une boisson aux fruits sont trois catégories juridiques distinctes,
// avec des seuils chiffrés. L'app ne juge pas, elle situe.
//
// ⚠️ RÈGLE DURE : le barème ne s'applique QUE si le produit appartient à la
// famille, d'après sa catégorie Open Food Facts - jamais parce que le mot
// apparaît quelque part. Un biscuit fourré au chocolat n'est pas un chocolat :
// le comparer à du chocolat de couverture n'a aucun sens. Pour les produits
// composés, c'est `chocolateForm` qui parle, pas le barème.
//
// ⚠️ SECONDE RÈGLE : on ne place le curseur que si le rang est CERTAIN. Un
// rang deviné rouvrirait la porte aux fausses accusations refermée le
// 2026-08-08. Dans le doute, `legalTier` renvoie null et rien ne s'affiche.
//
// Seuils européens, volontairement NON cités à l'écran : l'utilisatrice veut
// situer le produit, pas réciter une directive à quelqu'un qui fait ses courses.
const FAMILLES_LEGALES = [
  {
    nom: 'Jus de fruits',
    categorie: /(^|-)(juices?|nectars?|jus)$/,
    rangs: ['boisson aux fruits', 'nectar', 'à base de concentré', 'pur jus'],
    expl: [
      // ⚠️ Ce texte doit désamorcer la question du concentré : la liste en
      // contient souvent, et on cherche alors pourquoi le produit n'est pas
      // classé « à base de concentré ». La réponse est que la question ne se
      // pose plus une fois l'eau ajoutée.
      "De l'eau en tête de liste, et un édulcorant. Peu importe alors que le jus vienne d'un concentré ou non : dès qu'on ajoute de l'eau ou un édulcorant, ce n'est plus un jus. Cette catégorie-là n'a aucun minimum de fruit à respecter.",
      "Un nectar est un jus dilué et sucré : de 25 à 50 % de fruit selon l'espèce. C'est écrit sur l'étiquette, mais le mot ne dit pas ce qu'il cache.",
      "Du vrai jus, reconstitué à partir de concentré : on a retiré l'eau, puis on l'a remise. Ni sucre ni eau au-delà.",
      "Du fruit pressé, rien d'autre. Ni eau, ni sucre ajouté.",
    ],
    rang(nomNorm, ingrNorm, items) {
      const concentre = /a base de concentre|from concentrate|de concentre/.test(nomNorm + ' ' + ingrNorm);
      const pasDeConcentre = /not from concentrate|sans concentre|pur jus|100% pur/.test(nomNorm + ' ' + ingrNorm);
      if (/\bnectars?\b/.test(nomNorm)) return 1;
      if (concentre && !pasDeConcentre) return 2;
      if (/^eaux?$|^water$/.test(items[0] || '')) return 0;
      if (pasDeConcentre) return 3;
      return null;                                  // dans le doute, on se tait
    },
  },
  {
    nom: "Huile d'olive",
    categorie: /(^|-)(olive-oils?|huiles?-d-olive)$/,
    rangs: ['huile de grignons', "huile d'olive", 'vierge', 'vierge extra'],
    expl: [
      "Issue des résidus de pressage, raffinée. Le dernier rang de la famille.",
      "Un mélange d'huile raffinée et d'huile vierge. Le mot « vierge » manque, et ce n'est pas un oubli.",
      "Pressée mécaniquement, acidité au plus 2 %.",
      "Pressée mécaniquement, acidité au plus 0,8 % et aucun défaut de goût. Le rang le plus exigeant.",
    ],
    rang(nomNorm) {
      if (/vierge extra|extra vierge|extra.?virgin/.test(nomNorm)) return 3;
      if (/\bvierges?\b|\bvirgin\b/.test(nomNorm)) return 2;
      if (/grignons?|pomace/.test(nomNorm)) return 0;
      return 1;
    },
  },
];

// ⚠️ La catégorie se teste TAG PAR TAG, ancrée à la fin, et jamais sur la
// concaténation : `en:sardines-in-olive-oil` contient « olive-oil », et une
// boîte de sardines se retrouvait notée sur l'échelle des huiles. Les tags de
// la forme « X dans Y » sont écartés d'emblée - ils décrivent un produit X.
function estDeLaFamille(tags, motif) {
  return tags.some((tag) => {
    const nom = tag.replace(/^[a-z]{2}:/, '');
    if (/-(in|with|au|aux|a-la|and|et)-/.test(nom)) return false;
    return motif.test(nom);
  });
}

function legalTier(productName, ingredientsText, categoriesTags) {
  const tags = (categoriesTags || []).map((t) => normalize(t));
  if (!tags.length) return null;
  const nomNorm = normalize(productName);
  const ingrNorm = normalize(ingredientsText);
  const items = splitIngredientList(ingrNorm);
  for (const f of FAMILLES_LEGALES) {
    if (!estDeLaFamille(tags, f.categorie)) continue;
    const ici = f.rang(nomNorm, ingrNorm, items);
    if (ici === null || ici === undefined) return null;
    return { famille: f.nom, rangs: f.rangs, ici, expl: f.expl[ici], sommet: ici === f.rangs.length - 1 };
  }
  return null;
}

// LE POURCENTAGE DE CACAO NE SE LIT PAS COMME LES AUTRES.
//
// Sur une tablette, « 70 % de cacao » désigne le cacao sec TOTAL - pâte, beurre
// et poudre réunis. La part d'un seul ingrédient ne mesure donc pas la même
// chose, et l'estimation d'Open Food Facts encore moins : sur le Lindt
// Excellence, l'étiquette déclare 70 %, OFF n'a pas su lire ce chiffre et a
// estimé 30,58 % pour la pâte de cacao. L'app affichait 31 % en face d'un
// emballage qui dit 70, et avait l'air de contredire le fabricant.
//
// On ne retient donc QUE la déclaration du fabricant, et seulement quand le NOM
// et la LISTE portent le même chiffre. Deux sources d'accord valent mieux
// qu'une estimation ; et quand elles manquent, on n'affiche rien.
// Le pourcentage de cacao est une déclaration réglementée (directive
// 2000/36/CE), donc digne de confiance quand elle est là.
function chocolatePercent(productName, ingredientsText) {
  const dansNom = /(\d+(?:[.,]\d+)?)\s*%/.exec(String(productName || ''));
  if (!dansNom) return null;
  const n = normalize(ingredientsText);
  let dansListe = null;
  for (const mot of ['cacao', 'chocolat', 'cocoa', 'chocolate']) {
    const m = new RegExp(`\\b${mot}\\b[^,;()]{0,20}?(\\d+(?:[.,]\\d+)?)\\s*%`).exec(n);
    if (m) { dansListe = parseFloat(m[1].replace(',', '.')); break; }
  }
  if (dansListe === null) return null;
  const duNom = parseFloat(dansNom[1].replace(',', '.'));
  return Math.abs(duNom - dansListe) < 0.5 ? { valeur: dansListe, source: 'declare' } : null;
}

function chocolateForm(ingredientsText) {
  const n = normalize(ingredientsText);
  const vraies = CHOCO_FORMES_VRAIES.filter(([, re]) => re.test(n)).map(([nom]) => nom);
  if (vraies.length > 0) return { vrai: true, formes: vraies };
  const poudre = CHOCO_FORMES_POUDRE.find(([, re]) => re.test(n));
  if (poudre) return { vrai: false, formes: [poudre[0]] };
  return null;
}

function legalNoteHedge(motsManquants) {
  const noms = motsManquants.map(displayFlavor);
  const premier = noms[0];
  const phrases = [
    `Une mention comme "goût ${premier}" ou "saveur ${premier}" est légalement autorisée sur un produit qui ne contient pas ${articleDe(premier)} : elle décrit une saveur, pas une présence.`,
  ];
  if (motsManquants.some((m) => FAMILLE_CHOCOLAT.has(m))) {
    phrases.push('Pour le chocolat, la loi va plus loin : un produit "chocolaté" ne peut pas être appelé "chocolat", faute de beurre de cacao en quantité suffisante.');
  }
  phrases.push('Le fabricant respecte donc l\'étiquetage - mais le nom reste trompeur à la lecture rapide, d\'où cette mise en garde plutôt qu\'une accusation.');
  return phrases.join(' ');
}

// ⚠️ Le texte sur l'arôme n'est vrai QUE s'il y a un arôme. Servi devant une
// liste qui n'en contient aucun, il expliquait une règle sans rapport avec le
// produit affiché - la même invention que le libellé qu'il accompagnait.
function legalNoteFlavor(motsManquants, contexte = {}) {
  const noms = enumerer(motsManquants.map(displayFlavor));
  const { substitut = {}, tousAromes = true } = contexte;
  const remplaces = motsManquants.filter((f) => substitut[f]);

  if (remplaces.length) {
    const paires = remplaces
      .map((f) => `${displayFlavor(f)} annoncé, ${displayFlavor(substitut[f])} dans la liste`);
    return `Le nom met en avant ${noms}. La liste d'ingrédients donne autre chose de la même famille : ${enumerer(paires)}. La dénomination d'un aliment doit désigner ce qu'il est réellement, et l'information ne doit pas induire l'acheteur en erreur sur sa nature ou sa composition (règlement (UE) n°1169/2011, art. 7 et 17).`;
  }
  if (!tousAromes) {
    return `Le nom met en avant ${noms}, mais la liste d'ingrédients n'en fait aucune mention - pas même sous forme d'arôme. La dénomination d'un aliment doit désigner ce qu'il est réellement (règlement (UE) n°1169/2011, art. 7 et 17).`;
  }
  return `Le nom met en avant ${noms}, mais la liste d'ingrédients n'en contient que l'arôme. Un nom qui évoque un aliment décrit une saveur perçue, pas un ingrédient garanti : le règlement (UE) n°1169/2011 exige seulement que le mot "arôme" figure dans la liste, pas qu'il en précise la source.`;
}

// Détecte si le champ "ingrédients" d'OFF contient en fait un TABLEAU NUTRITIONNEL
// (donnée corrompue) au lieu d'une vraie liste. On n'utilise QUE des marqueurs forts
// qui n'apparaissent jamais dans une liste d'ingrédients (unités d'énergie, "pour
// 100 g", lignes de tableau) - pas des mots d'ingrédients courants comme "sucre" ou
// "sodium" (qui faisaient de faux positifs sur des produits normaux).
function isNutritionFactsInsteadOfIngredients(ingredientsText) {
  if (!ingredientsText) return false;
  const n = normalize(ingredientsText);
  const strongMarkers = [
    /\bkj\b/,                                 // énergie en kilojoules
    /\bkcal\b/,                               // énergie en kilocalories
    /pour\s*100\s*(g|ml)/,                    // "pour 100 g"
    /per\s*100\s*(g|ml)/,                     // "per 100 g"
    /valeurs?\s+nutritionnel/,                // "valeurs nutritionnelles"
    /nutrition(al)?\s+(facts|information|value)/,
    /dont\s+acides\s+gras/,                   // ligne "dont acides gras saturés"
    /dont\s+sucres/,                          // ligne "glucides dont sucres"
    /of\s+which\s+(saturates|sugars)/,
    /\benergie\b/, /\benergy\b/,
  ];
  // Marqueurs DÉCISIFS : un seul suffit. Ce sont des titres de tableau ou des
  // unités d'énergie qui ne figurent JAMAIS dans une liste d'ingrédients.
  // Exiger deux marqueurs faisait passer à travers le cas réel de Cocoa Camino
  // (0752612000113), dont le champ ingrédients contient un morceau de tableau
  // OCRisé ne portant que "Nutrition Facts" : une poudre de cacao équitable
  // était alors accusée de ne pas contenir de cacao.
  const decisiveMarkers = [
    /nutrition(al)?\s+(facts|information|value)/, // "Nutrition Facts"
    /valeurs?\s+nutriti/,                         // "valeur nutritive", "valeurs nutritionnelles"
    /\bkj\b/, /\bkcal\b/,                         // unités d'énergie
    /dont\s+acides\s+gras/,
    /of\s+which\s+(saturates|sugars)/,
  ];
  if (decisiveMarkers.some((re) => re.test(n))) return true;

  const hits = strongMarkers.filter((re) => re.test(n)).length;
  return hits >= 2; // 2+ marqueurs faibles = vrai tableau nutritionnel
}

/**
 * @param {string} productName
 * @param {string} ingredientsText
 * @returns {{ verdict: 'clean'|'warning'|'misleading'|'unknown', headline: string, legalNote?: string, detail?: object }}
 */
// ===========================================================================
// ALLÉGATIONS « SANS X » CONTREDITES PAR LA LISTE D'ADDITIFS
//
// « Sans colorant » sur la face avant, E160a dans la liste. C'est une astuce de
// terminologie au sens strict - le cœur de la mission - et l'app répondait
// « Rien à vérifier », parce qu'elle ne regardait que les mots d'ALIMENTS.
// Les additifs, eux, étaient déjà chargés pour la tuile : la donnée était là,
// personne ne la croisait avec le nom.
//
// ⚠️ LE RISQUE N'EST PAS DE RATER UN MENTEUR, C'EST D'ACCUSER UN HONNÊTE.
// Deux garde-fous, tous deux payés par de vraies fausses accusations évitées :
//
//  1. Les familles sont définies par LISTE DE PLAGES, jamais par « la centaine ».
//     Les E200 ne sont pas tous des conservateurs : E290 est du gaz carbonique,
//     E296 et E297 des acidifiants, E270 de l'acide lactique. Prendre 200-299
//     en bloc accusait toute eau pétillante et tout yaourt vendus « sans
//     conservateur ». Une famille trop étroite fait manquer un menteur ; une
//     famille trop large invente un coupable. On préfère manquer.
//
//  2. « Sans colorant ARTIFICIEL » n'est pas « sans colorant ». E160a (carotène)
//     est un colorant naturel : l'allégation tient, et c'est de loin la
//     formulation la plus courante sur les emballages. On ne conclut alors que
//     sur les colorants de synthèse, nommément listés. Pour les autres familles,
//     on n'a pas de partage naturel/synthèse défendable : on se tait.
// ===========================================================================

// Tout tag d'additif d'Open Food Facts, y compris les codes IMPRÉCIS que la
// base contient réellement (`en:e14xx` = « un amidon modifié, on ne sait pas
// lequel »). Ils comptent comme additifs, mais leur numéro est illisible.
const estAdditif = (tag) => /^[a-z]{2}:e\d/.test(String(tag || '').toLowerCase());

// ⚠️ Le numéro n'est retenu que s'il est COMPLET : trois ou quatre chiffres,
// suivis au plus d'une lettre de sous-forme. Sans cette exigence, `en:e14xx`
// se lisait « E14 » et tombait dans des plages auxquelles il n'appartient pas.
const num_e = (tag) => {
  const m = /^[a-z]{2}:e(\d{3,4})[a-z]*$/.exec(String(tag || '').toLowerCase());
  return m ? parseInt(m[1], 10) : null;
};

// Colorants de synthèse (azoïques et apparentés). Seule liste qui permette de
// juger un « sans colorant artificiel » sans deviner.
const COLORANTS_SYNTHESE = new Set([
  102, 104, 110, 122, 123, 124, 127, 128, 129, 131, 132, 133, 142, 151, 154, 155, 180,
]);

const FAMILLES_ADDITIFS = {
  colorant: {
    libelle: 'sans colorant',
    // E100 à E199 : la plage des colorants est, elle, homogène.
    membre: (n) => n >= 100 && n <= 199,
    synthese: (n) => COLORANTS_SYNTHESE.has(n),
    // « colour », « colours », « colouring », « coloring », « colorant ». Le
    // suffixe doit être FACULTATIF : sans ça, « no artificial colours » - la
    // formulation anglaise la plus courante - passait à travers.
    mot: /colorants?|colou?r(?:ing|ant)?s?/,
  },
  conservateur: {
    libelle: 'sans conservateur',
    // Sorbates, benzoates, sulfites, nisine/natamycine, nitrites/nitrates,
    // propionates. Sont volontairement EXCLUS : E260-E263 (acétates),
    // E270 (acide lactique), E290 (CO2), E296/E297 (acidifiants) - ce sont des
    // régulateurs d'acidité, pas des conservateurs.
    // MESURÉ le 2026-08-10 sur 120 produits portant l'allégation : la plage
    // 200-299 prise en bloc accusait 11 produits, cette liste en accuse 4. Les
    // 7 écarts venaient tous de E262, E296 et E270 - dont les chips Lay's
    // « saveur barbecue » et un fromage à effilocher. Sept fausses accusations
    // sur cent vingt fiches, pour quatre vraies.
    membre: (n) => (n >= 200 && n <= 242) || (n >= 249 && n <= 252) || (n >= 280 && n <= 285),
    mot: /conservateurs?|preservatives?/,
  },
  edulcorant: {
    libelle: 'sans édulcorant',
    // Polyols (E420, E421) et édulcorants intenses (E950-E969).
    membre: (n) => n === 420 || n === 421 || (n >= 950 && n <= 969),
    mot: /edulcorants?|sweeteners?/,
  },
  exhausteur: {
    libelle: 'sans exhausteur de goût',
    // Glutamates, ribonucléotides, glycine.
    membre: (n) => n >= 620 && n <= 650,
    mot: /exhausteurs?(?: de gout)?|flavou?r enhancers?|msg/,
  },
  // En dernier : le plus large, il n'a de sens que si aucun autre n'a parlé.
  additif: {
    libelle: 'sans additif',
    membre: () => true,
    mot: /additifs?|additives?/,
  },
};

// « sans colorant ni conservateur » : le second mot est hors de portée d'un
// simple /sans\s+conservateur/. On autorise une chaîne d'énumération entre
// « sans » et le mot cherché - au plus trois maillons, pour que la portée ne
// s'étende pas à tout le nom (« sans sucre, aux éclats de chocolat coloré »).
const CHAINE_SANS = "(?:[a-z'-]+(?:\\s+[a-z'-]+){0,2}\\s*(?:,|\\bni\\b|\\bet\\b)\\s*){0,3}";

// « artificiel » collé au mot de famille, dans les deux ordres et deux langues.
const QUALIFIE_ARTIFICIEL = (mot) => new RegExp(
  `(?:artificiels?|synthetiques?|de synthese)\\s+(?:${mot.source})`
  + `|(?:${mot.source})\\s+(?:artificiels?|synthetiques?|de synthese)`
  + `|artificial\\s+(?:${mot.source})`,
);

// Renvoie le conflit le plus PRÉCIS trouvé, ou null.
// `additivesTags` vient tel quel d'Open Food Facts (`['en:e160a', ...]`).
function claimConflict(productName, additivesTags) {
  // On garde les codes imprécis : ils ne peuvent contredire aucune famille
  // nommée (leur numéro est illisible, donc hors de toutes les plages), mais
  // ils comptent bel et bien pour un « sans additif ».
  const tags = (additivesTags || []).filter(estAdditif);
  if (!tags.length) return null;
  const nom = normalize(productName);
  if (!nom.includes('sans') && !/\bno\b|free\b|without/.test(nom)) return null;

  for (const [famille, f] of Object.entries(FAMILLES_ADDITIFS)) {
    const m = f.mot.source;
    const annonce = new RegExp(
      `\\bsans\\s+${CHAINE_SANS}(?:${m})`          // sans colorant [ni conservateur]
      + `|\\b(?:no|without)\\s+(?:artificial\\s+)?(?:${m})` // no (artificial) colouring
      + `|(?:${m})[- ]free`,                        // preservative-free
    );
    if (!annonce.test(nom)) continue;

    // Allégation restreinte à l'artificiel : hors colorants, on n'a aucun
    // partage naturel/synthèse défendable, donc on ne conclut pas.
    let membre = f.membre;
    if (QUALIFIE_ARTIFICIEL(f.mot).test(nom)) {
      if (!f.synthese) continue;
      membre = f.synthese;
    }

    const fautifs = tags.filter((t) => membre(num_e(t)));
    if (fautifs.length) return { famille, libelle: f.libelle, fautifs };
  }
  return null;
}

// « E160a », « E202 et E211 » - le code brut, jamais un nom inventé : c'est ce
// qui est écrit sur l'emballage, et l'acheteur peut le retrouver à l'œil.
// ⚠️ Seul le E se met en capitale. Le suffixe de lettre est minuscule dans la
// nomenclature (E160a, E150d) : « E160A » ne correspond à rien d'imprimé.
function additiveLabel(tag) {
  return String(tag || '').replace(/^[a-z]{2}:/, '').replace(/^e/, 'E');
}

function nommerAdditifs(tags) {
  return enumerer(tags.map(additiveLabel));
}

const LEGAL_NOTE_ALLEGATION =
  "Une mention « sans… » est une allégation : elle n'est autorisée que si elle est exacte, et l'information ne doit pas induire l'acheteur en erreur sur les caractéristiques du produit (règlement (UE) n°1169/2011, art. 7). Les additifs listés ici sont ceux déclarés par le fabricant lui-même.";

function headlineAllegation(conflit) {
  const noms = nommerAdditifs(conflit.fautifs);
  return `« ${conflit.libelle} » annoncé, mais la liste contient ${noms}`;
}

// Enveloppe le moteur : l'analyse du nom et des ingrédients ne change pas d'une
// ligne, on lui ajoute une couche. Sans `contexte` (deux arguments), le résultat
// est identique à celui d'avant - c'est ce qui garde valables les tests
// existants, et ce qui rend la nouvelle règle sûre à retirer.
function detectVerdict(productName, ingredientsText, contexte) {
  const base = detectVerdictBase(productName, ingredientsText);
  if (!contexte) return base;

  const conflit = claimConflict(productName, contexte.additivesTags);
  if (!conflit) return base;

  // Composition illisible ou absente : on ne sait rien de la liste, donc rien
  // de l'allégation non plus. Ces états expliquent une limite, ne pas la nier.
  if (base.verdict === 'unknown' || base.verdict === 'foreign') return base;

  // Le verdict accuse déjà : son libellé est plus parlant qu'un code d'additif
  // (« "fraise" absent » vaut mieux que « la liste contient E129 »). On le
  // garde et on joint le conflit, pour l'affichage et pour la mesure.
  if (base.verdict === 'misleading') {
    return { ...base, detail: { ...(base.detail || {}), claim: conflit } };
  }

  // « À vérifier », « Conforme », « Rien à vérifier » : le fabricant a peut-être
  // prévenu sur la saveur, il n'a pas prévenu sur l'additif. Une allégation
  // fausse l'emporte sur une réserve honnête.
  return {
    verdict: 'misleading',
    headline: headlineAllegation(conflit),
    legalNote: LEGAL_NOTE_ALLEGATION,
    detail: { rule: 'allegation-contredite', claim: conflit },
  };
}

function detectVerdictBase(productName, ingredientsText) {
  // Vérifier si OFF a capturé du texte nutritionnel au lieu d'ingrédients
  if (isNutritionFactsInsteadOfIngredients(ingredientsText)) {
    return {
      verdict: 'unknown',
      headline: 'Composition indisponible - données Open Food Facts incomplètes',
    };
  }

  // Exclure les produits "Chocolate X%" - chocolat pur, pas une saveur
  if (/chocolate.+\d+\s*%/i.test(productName)) {
    return {
      verdict: 'clean',
      headline: 'Le nom du produit correspond à sa composition réelle',
    };
  }

  const nameNorm = normalize(productName);
  const ingredientsNorm = normalize(ingredientsText);

  if (!ingredientsNorm) {
    return {
      verdict: 'unknown',
      headline: "Composition indisponible sur Open Food Facts - impossible de vérifier.",
    };
  }

  for (const rule of NON_CONFORME_PATTERNS) {
    if (rule.pattern.test(nameNorm)) {
      return {
        verdict: 'misleading',
        headline: rule.headline(rule.label),
        legalNote: rule.legalNote,
        detail: {
          rule: 'denomination-non-conforme',
          matched: rule.label,
          compareSuggest: rule.compareSuggest,
          compareReal: rule.compareReal,
        },
      };
    }
  }

  // Jeu de mots / expression figurée : le mot d'aliment n'est pas une allégation.
  for (const expr of NON_LITERAL_EXPRESSIONS) {
    if (expr.test(nameNorm)) {
      return {
        verdict: 'clean',
        headline: 'Jeu de mots / expression - pas une allégation sur la composition',
      };
    }
  }

  const flavors = findFlavorMention(productName);

  if (flavors.length > 0) {
    // Exclure si c'est "Chocolate X%" - chocolat pur, pas une saveur
    const isChocolatePercent = flavors.includes('chocolate') && /\d+\s*%/.test(productName);

    if (!isChocolatePercent) {
      const missingFlavors = [];
      const suspiciousFlavors = [];
      // Mots ÉCARTÉS faute de pouvoir conclure. À ne pas confondre avec les mots
      // vérifiés : sans cette liste, l'app affichait « "fromage" confirmé dans
      // la composition réelle » pour un Fromage blanc dont les ingrédients
      // disent "lait écrémé, ferments lactiques" - une confirmation qu'elle
      // n'avait pas faite, puisqu'elle avait justement renoncé à chercher.
      const skippedWords = [];

      for (const flavor of flavors) {
        // Catégorie de produit absente de sa propre liste d'ingrédients : normal
        // ("Fromage blanc" = lait + ferments). On ne conclut rien.
        if (CATEGORY_WORDS.has(flavor) && !isMentionedInIngredients(flavor, ingredientsNorm)) {
          skippedWords.push(flavor);
          continue;
        }
        // On teste l'arôme EN PREMIER : sinon un ingrédient "arôme noix" était
        // compté comme de la vraie noix (findIngredientPosition matche le mot
        // même collé à "arôme"), ce qui laissait passer de vraies tromperies.
        if (onlyAppearsAsArome(flavor, ingredientsNorm)) {
          // Absent, ou présent uniquement en tant qu'arôme → manquant
          missingFlavors.push(flavor);
        }
        // Sinon : présent comme vrai ingrédient → rien à signaler (clean)
      }

      // Si des saveurs sont manquantes : deux cas très différents.
      if (missingFlavors.length > 0) {
        const presentFlavors = flavors.filter((f) => !missingFlavors.includes(f));

        // « Manquant » recouvrait deux situations que le libellé confondait :
        // le mot n'apparaît QUE dans un arôme, ou il n'apparaît pas du tout.
        // Dans le second cas, parler d'arôme est une invention pure - et c'est
        // le cas le plus grave, celui du substitut.
        const estArome = {};
        const substitut = {};
        for (const f of missingFlavors) {
          estArome[f] = isMentionedInIngredients(f, ingredientsNorm);
          if (!estArome[f]) substitut[f] = findSubstitute(f, ingredientsNorm);
        }
        const remplaces = missingFlavors.filter((f) => substitut[f]);
        const tousAromes = missingFlavors.every((f) => estArome[f]);
        // « pangasius », « pangasius et surimi » - dédoublonné : deux aliments
        // promis peuvent avoir été remplacés par le même.
        const nomsSubstituts = enumerer([...new Set(remplaces.map((f) => displayFlavor(substitut[f])))]);

        const detail = {
          // Surligner ce qui est réellement là (mot BRUT : il doit correspondre
          // au texte des ingrédients, pas à sa traduction d'affichage)
          matched: presentFlavors.join(', '),
          // "Le nom suggère" = TOUT ce que le nom annonce, pas juste ce qui manque
          compareSuggest: flavors.map(displayFlavor).join(', '),
          compareReal: [
            ...missingFlavors.map((f) => {
              if (estArome[f]) return `${displayFlavor(f)} : saveur seule`;
              if (substitut[f]) return `${displayFlavor(f)} : remplacé par ${displayFlavor(substitut[f])}`;
              return `${displayFlavor(f)} : absent`;
            }),
            ...presentFlavors.map((f) => `${displayFlavor(f)} : présent`),
          ].join(', '),
          // Aligné sur compareReal, part par part. C'est le producteur du
          // libellé qui produit ses annotations : aucune ré-association
          // fragile côté affichage. Rien à dire sur un aliment absent.
          formes: [
            ...missingFlavors.map(() => null),
            ...presentFlavors.map((f) => formeTrouvee(f, ingredientsNorm)),
          ],
        };
        const liste = missingFlavors.map(displayFlavor).join(', ');

        // CAS 1 - Le fabricant a PRÉVENU ("chocolaté", "saveur X", "goût X") :
        // c'est légal et déclaré. Ni "clean" (le client mérite de le savoir),
        // ni "trompeur" (ils n'ont pas menti) -> À vérifier.
        if (hasHedgeWord(productName)) {
          return {
            verdict: 'warning',
            headline: missingFlavors.length === 1
              ? `"${liste}" est une saveur, pas l'ingrédient`
              : `${liste} : des saveurs, pas les ingrédients`,
            legalNote: legalNoteHedge(missingFlavors),
            detail: { ...detail, rule: 'saveur-annoncee' },
          };
        }

        // CAS 2 - Le nom AFFIRME l'ingrédient sans réserve, et il est absent.
        // Trois phrases, parce qu'il y a trois situations. L'ancienne version
        // n'en avait qu'une et parlait d'arôme même quand il n'y en avait pas.
        let headline;
        if (remplaces.length) {
          headline = missingFlavors.length === 1
            ? `"${liste}" absent - remplacé par ${nomsSubstituts}`
            : `${missingFlavors.length} aliments annoncés absents - remplacés par ${nomsSubstituts}`;
        } else if (tousAromes) {
          headline = missingFlavors.length === 1
            ? `"${liste}" absent - seulement un arôme`
            : `${missingFlavors.length} saveurs absentes - seulement des arômes`;
        } else {
          headline = missingFlavors.length === 1
            ? `"${liste}" absent de la liste`
            : `${missingFlavors.length} aliments annoncés absents de la liste`;
        }
        return {
          verdict: 'misleading',
          headline,
          legalNote: legalNoteFlavor(missingFlavors, { substitut, tousAromes }),
          detail: { ...detail, rule: 'saveur-sans-ingredient', substituts: substitut },
        };
      }

      // PAS DE SEUIL DE POURCENTAGE. Une règle "moins de 5 % => À vérifier" a
      // existé ici jusqu'au 2026-08-04. Elle a été retirée : un seuil ne dit
      // rien de la loyauté d'un nom. 2 % d'amande, c'est de l'amande ; une
      // bisque à 3,8 % de homard contient du homard ; et une soupe est liquide
      // par définition, donc l'eau y domine normalement. Aucune valeur unique
      // n'est juste dans toutes les catégories : elle accuserait des produits
      // honnêtes et blanchirait des produits douteux.
      // La proportion réelle est désormais AFFICHÉE dans "Il y a vraiment"
      // (voir ingredientShare) et l'acheteur juge avec son contexte.
      // On n'annonce QUE les mots réellement vérifiés. Si tous ont été écartés
      // (nom entièrement fait de catégories : "Fromage blanc", "Beurre doux"),
      // il n'y a rien à confirmer : on tombe dans "Rien à vérifier" plus bas.
      const checkedFlavors = flavors.filter((f) => !skippedWords.includes(f));
      if (checkedFlavors.length === 0) {
        return {
          verdict: 'noclaim',
          headline: 'Ce nom ne met en avant aucun aliment vérifiable',
        };
      }

      const firstFlavorPos = findIngredientPosition(checkedFlavors[0], ingredientsNorm);
      const shown = checkedFlavors.map(displayFlavor).join(', ');

      return {
        verdict: 'clean',
        headline: checkedFlavors.length === 1
          ? `"${displayFlavor(checkedFlavors[0])}" confirmé dans la composition réelle`
          : `Toutes les saveurs confirmées dans la composition réelle`,
        legalNote: LEGAL_NOTE_POSITION,
        detail: {
          rule: 'ingredient-confirme',
          matched: checkedFlavors.join(', '), // mot brut pour le surlignage
          compareSuggest: shown,
          compareReal: shown,
          formes: checkedFlavors.map((f) => formeTrouvee(f, ingredientsNorm)),
          ...(firstFlavorPos && { index: firstFlavorPos.index, total: firstFlavorPos.total, ratio: firstFlavorPos.ratio }),
        },
      };
    }
  }

  // AUCUN mot d'aliment reconnu dans le nom : il n'y avait rien à comparer.
  // Ce n'est PAS "clean". Jusqu'au 2026-08-07 on renvoyait ici "clean" +
  // "Le nom du produit correspond à sa composition réelle" - une correspondance
  // que l'app n'avait jamais vérifiée, faute de promesse à vérifier.
  // Mesure sur les 400 produits les plus scannés d'OFF (242 fiches jugeables) :
  // 57,4 % finissaient ici, contre 36,8 % de "clean" réellement confirmés.
  // C'était donc l'écran le plus fréquent de l'app, et sa seule affirmation
  // fausse. "Eau de source", "Coca-Cola" ou "Skyr nature" ne promettent aucun
  // aliment : rien à démasquer, mais rien de vérifié non plus.
  return {
    verdict: 'noclaim',
    headline: 'Ce nom ne met en avant aucun aliment',
  };
}

// ===========================================================================
// PROPORTION RÉELLE de l'aliment promis
//
// Open Food Facts expose, à côté du texte, une liste d'ingrédients STRUCTURÉE :
// identifiant taxonomique, pourcentage déclaré par le fabricant (QUID),
// estimation calculée par OFF, et sous-ingrédients pour les composés.
//
// Voir docs/superpowers/specs/2026-08-04-proportion-reelle-design.md
// ===========================================================================

// Aplatit l'arbre en gardant la profondeur : un aliment promis est souvent un
// SOUS-ingrédient ("noisettes" dans "pâte à tartiner aux noisettes").
function flattenIngredients(list, depth = 0, out = []) {
  for (const item of list || []) {
    out.push({ item, depth });
    if (item && item.ingredients) flattenIngredients(item.ingredients, depth + 1, out);
  }
  return out;
}

function taxonomyId(item) {
  return String((item && item.id) || '')
    .replace(/^[a-z]{2}:/, '')
    .replace(/-/g, ' ')
    .toLowerCase();
}

/**
 * Proportion de `word` dans le produit, d'après la liste structurée d'OFF.
 *
 * ON NE CHERCHE JAMAIS DANS LE TEXTE LIBRE. "Pâte à tartiner aux NOISETTES"
 * contient le mot "noisette" et pèse 54 %, alors que la noisette elle-même n'y
 * est qu'à 1,5 % : chercher dans le texte attribuait au fruit le poids du
 * composé, un facteur 36 sur un chiffre montré à l'utilisateur.
 *
 * L'identifiant taxonomique est en anglais : on traduit d'abord le mot promis,
 * sinon "homard" ne trouve jamais "en:lobster".
 *
 * @returns {{valeur:number, source:'declare'|'estime'}|null}
 */
function ingredientShare(word, ingredients) {
  if (!word || !Array.isArray(ingredients) || ingredients.length === 0) return null;
  // Un mot de catégorie ne figure jamais dans sa propre liste : le chiffrer
  // n'aurait pas de sens ("beurre" dans un beurre d'amandes).
  if (SHARE_BLOCKED_WORDS.has(word)) return null;
  // Le cacao a son propre lecteur, `chocolatePercent` : la part d'un ingrédient
  // ne mesure pas ce que l'emballage appelle « % de cacao ».
  if (FAMILLE_CHOCOLAT.has(word)) return null;

  const targets = new Set((INGREDIENT_VARIANTS[word] || [word]).map((v) => normalize(v)));
  const flat = flattenIngredients(ingredients);

  // 1. Identifiant exactement égal à une variante : en:lobster pour "homard".
  let hit = flat.find(({ item }) => targets.has(taxonomyId(item)));
  // 2. Sinon une espèce plus précise : en:american-lobster finit par "lobster".
  if (!hit) {
    hit = flat.find(({ item }) => {
      const id = taxonomyId(item);
      return [...targets].some((t) => id.endsWith(' ' + t) || id.startsWith(t + ' '));
    });
  }
  if (!hit) return null;

  // Le QUID déclaré n'est absolu qu'au PREMIER NIVEAU. Imbriqué, il est relatif
  // à son parent : le "cacao 40 %" d'un biscuit est 40 % de la pâte à tartiner,
  // pas du biscuit. percent_estimate est toujours absolu, mais c'est un calcul.
  const cap = (n) => Math.min(100, n); // vu : 103,86 % sur des amandes nature
  const declare = hit.depth === 0 && typeof hit.item.percent === 'number' && hit.item.percent > 0
    ? cap(hit.item.percent) : null;
  const estime = typeof hit.item.percent_estimate === 'number' && hit.item.percent_estimate > 0
    ? cap(hit.item.percent_estimate) : null;

  // Le pourcentage déclaré n'est retenu que si l'estimation d'OFF le corrobore.
  // L'analyseur d'OFF rattache parfois un pourcentage au mauvais ingrédient :
  // sur "Pâte à tartiner aux NOISETTES et au cacao 40% (...)", les 40 % sont
  // ceux de la pâte à tartiner, mais ils se retrouvent portés par "cacao".
  // Quand les deux sources du même fait se contredisent, on ne présente pas
  // l'une comme une déclaration du fabricant : on retombe sur l'estimation,
  // annoncée comme telle.
  if (declare !== null) {
    const coherent = estime === null
      || (declare <= estime * 2 && estime <= declare * 2);
    if (coherent) return { valeur: declare, source: 'declare' };
  }
  if (estime !== null) return { valeur: estime, source: 'estime' };
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    detectVerdict, normalize, findFlavorMention, onlyAppearsAsArome,
    findIngredientPosition, ingredientShare, isMentionedInIngredients,
    splitIngredientList, chocolateForm, chocolatePercent, legalTier,
    claimConflict, additiveLabel, findSubstitute,
  };
}
