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
  return stripAccents(str || '').toLowerCase().trim();
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

const FLAVOR_PATTERN = /(?:saveur|gout|parfum|essence|extrait|concentre)\s+(?:de\s+)?([a-z]+(?:\s+[a-z]+)?)/g;

// Mots d'ingrédients/fruits assez identifiables pour qu'on les vérifie quand ils
// apparaissent tels quels dans le nom du produit (ex. "Blueberry Waffles"),
// même sans "saveur/goût" devant. Volontairement limité aux mots concrets et peu
// ambigus (fruits, arômes classiques) - pas les noms de marque ("Nutella").
const FOOD_WORDS = [
  'myrtille', 'blueberry', 'fraise', 'strawberry', 'framboise', 'raspberry',
  'vanille', 'vanilla', 'chocolat', 'chocolate', 'chocolatey', 'cacao', 'cocoa', 'noisette', 'hazelnut',
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
};

// Affichage en français des mots détectés : normalize() enlève les accents,
// donc "chocolaté" devient "chocolate", qui a l'air anglais à l'écran. On
// réaffiche le mot français attendu par l'utilisateur.
const DISPLAY_FR = {
  chocolate: 'chocolat', chocolatey: 'chocolat', chocolates: 'chocolat', cocoa: 'cacao',
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
};

function displayFlavor(word) {
  return DISPLAY_FR[word] || word;
}

function findFlavorMention(productName) {
  // Exclure les produits "Chocolate X%", "Dark Chocolate Y%", etc.
  if (/chocolate.+\d+\s*%/i.test(productName)) {
    return [];
  }

  const nameNorm = normalize(productName);
  const flavors = new Set();

  // Cherche toutes les saveurs "saveur X", "goût X", "parfum X"
  const explicitMatches = nameNorm.matchAll(FLAVOR_PATTERN);
  for (const match of explicitMatches) {
    flavors.add(match[1].trim());
  }

  // Cherche tous les FOOD_WORDS directs (fruits, arômes) - incluant pluriels
  const pluralWords = FOOD_WORDS.map(w => pluralPattern(w)).join('|');
  const foodWordPattern = new RegExp(`\\b(${pluralWords})\\b`, 'g');
  const directMatches = nameNorm.matchAll(foodWordPattern);
  for (const match of directMatches) {
    flavors.add(match[1].trim());
  }

  return Array.from(flavors);
}

// Variante(s) plurielles d'un mot, pour matcher "fraise"/"fraises" mais aussi
// "blueberry"/"blueberries" (pluriel anglais en -y -> -ies).
function pluralPattern(word) {
  const alternatives = [word, `${word}s`];
  if (word.endsWith('y')) alternatives.push(`${word.slice(0, -1)}ies`);
  return alternatives.join('|');
}

// Marqueurs signalant une SAVEUR et non l'ingrédient réel. "arôme" ne suffit
// pas : les fabricants écrivent aussi "à saveur de chocolat", "goût vanille",
// "dark chocolate flavoured chunks"... (cas réel : mélange BASSÉ, où
// "morceaux à saveur de chocolat noir" était compté comme du vrai chocolat).
const FLAVOUR_MARKER = /arom[ae]s?|saveur|gout|parfum|flavou?red?|chocolate?y/;

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

// Le NOM contient-il une réserve ("chocolaté", "saveur X", "goût X",
// "chocolatey", "flavoured") ? Si oui, le fabricant a prévenu : c'est légal et
// déclaré -> "À vérifier", pas "Trompeur".
// Attention : on teste le nom BRUT car normalize() transforme "chocolaté" en
// "chocolate", qui deviendrait indiscernable de l'anglais "chocolate".
function hasHedgeWord(productName) {
  const raw = String(productName || '');
  if (/chocolat[éÉ]/i.test(raw)) return true;           // chocolaté / CHOCOLATÉ
  if (/\bchocolate?y\b/i.test(raw)) return true;         // chocolatey (anglais)
  if (/\bflavou?red?\b/i.test(raw)) return true;         // flavoured / flavor
  return /arom|saveur|gout|parfum/.test(normalize(raw)); // arôme / saveur / goût
}

function findIngredientPosition(word, ingredientsNorm) {
  const items = ingredientsNorm.split(',').map((s) => s.trim()).filter(Boolean);
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  const wordRe = new RegExp(`\\b(?:${variants})\\b`);
  const index = items.findIndex((item) => wordRe.test(item));
  if (index === -1) return null;
  return { index, total: items.length, ratio: (index + 1) / items.length };
}

const LEGAL_NOTE_POSITION =
  'L\'ordre de la liste d\'ingrédients doit refléter leur quantité décroissante (règlement (UE) n°1169/2011, art. 18). La position d\'un ingrédient est donc un signal fiable de sa proportion réelle.';

const LEGAL_NOTE_HEDGE =
  'Une mention comme "chocolaté", "saveur X" ou "goût X" est légalement autorisée pour un produit qui ne contient PAS l\'ingrédient : elle décrit une saveur, pas une présence. Ainsi "chocolaté" ne peut pas être appelé "chocolat", faute de beurre de cacao en quantité suffisante. Le fabricant respecte donc l\'étiquetage - mais le nom reste trompeur à la lecture rapide, d\'où cette mise en garde plutôt qu\'une accusation.';

const LEGAL_NOTE_FLAVOR =
  'La mention d\'un ingrédient dans le nom ("saveur / goût X", ou le nom direct d\'un fruit/arôme) décrit une saveur perçue, pas un ingrédient garanti. Le règlement (UE) n°1169/2011 exige seulement que "arôme" figure dans la liste - pas qu\'il précise sa source.';

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
  const hits = strongMarkers.filter((re) => re.test(n)).length;
  return hits >= 2; // 2+ marqueurs forts = vrai tableau nutritionnel
}

/**
 * @param {string} productName
 * @param {string} ingredientsText
 * @returns {{ verdict: 'clean'|'warning'|'misleading'|'unknown', headline: string, legalNote?: string, detail?: object }}
 */
function detectVerdict(productName, ingredientsText) {
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

      for (const flavor of flavors) {
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
        const detail = {
          // Surligner ce qui est réellement là (mot BRUT : il doit correspondre
          // au texte des ingrédients, pas à sa traduction d'affichage)
          matched: presentFlavors.join(', '),
          // "Le nom suggère" = TOUT ce que le nom annonce, pas juste ce qui manque
          compareSuggest: flavors.map(displayFlavor).join(', '),
          compareReal: [
            ...missingFlavors.map((f) => `${displayFlavor(f)} : saveur seule`),
            ...presentFlavors.map((f) => `${displayFlavor(f)} : présent`),
          ].join(', '),
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
            legalNote: LEGAL_NOTE_HEDGE,
            detail: { ...detail, rule: 'saveur-annoncee' },
          };
        }

        // CAS 2 - Le nom AFFIRME l'ingrédient sans réserve, et il est absent.
        return {
          verdict: 'misleading',
          headline: missingFlavors.length === 1
            ? `"${liste}" absent - seulement un arôme`
            : `${missingFlavors.length} saveurs absentes - seulement des arômes`,
          legalNote: LEGAL_NOTE_FLAVOR,
          detail: { ...detail, rule: 'saveur-sans-ingredient' },
        };
      }

      // Toutes les saveurs sont présentes correctement
      const firstFlavorPos = findIngredientPosition(flavors[0], ingredientsNorm);
      const shown = flavors.map(displayFlavor).join(', ');

      return {
        verdict: 'clean',
        headline: flavors.length === 1
          ? `"${displayFlavor(flavors[0])}" confirmé dans la composition réelle`
          : `Toutes les saveurs confirmées dans la composition réelle`,
        legalNote: LEGAL_NOTE_POSITION,
        detail: {
          rule: 'ingredient-confirme',
          matched: flavors.join(', '), // mot brut pour le surlignage
          compareSuggest: shown,
          compareReal: shown,
          ...(firstFlavorPos && { index: firstFlavorPos.index, total: firstFlavorPos.total, ratio: firstFlavorPos.ratio }),
        },
      };
    }
  }

  return {
    verdict: 'clean',
    headline: 'Le nom du produit correspond à sa composition réelle',
  };
}

if (typeof module !== 'undefined') {
  module.exports = { detectVerdict, normalize, findFlavorMention, onlyAppearsAsArome, findIngredientPosition };
}
