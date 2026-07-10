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

const FLAVOR_PATTERN = /(?:saveur|gout|parfum|essence|extrait|concentre)\s+(?:de\s+)?([a-z]+(?:\s+[a-z]+)?)/g;

// Mots d'ingrédients/fruits assez identifiables pour qu'on les vérifie quand ils
// apparaissent tels quels dans le nom du produit (ex. "Blueberry Waffles"),
// même sans "saveur/goût" devant. Volontairement limité aux mots concrets et peu
// ambigus (fruits, arômes classiques) - pas les noms de marque ("Nutella").
const FOOD_WORDS = [
  'myrtille', 'blueberry', 'fraise', 'strawberry', 'framboise', 'raspberry',
  'vanille', 'vanilla', 'chocolat', 'chocolate', 'cacao', 'cocoa', 'noisette', 'hazelnut',
  'citron', 'lemon', 'orange', 'banane', 'banana', 'pomme', 'apple',
  'cerise', 'cherry', 'coco', 'coconut', 'caramel', 'cafe', 'coffee',
  'cannelle', 'cinnamon', 'mangue', 'mango', 'peche', 'peach',
  'pistache', 'pistachio', 'abricot', 'apricot', 'ananas', 'pineapple',
  'poire', 'pear', 'grenade', 'pomegranate', 'menthe', 'mint',
  'boeuf', 'beef', 'aubergine', 'eggplant',
];
// Pattern created dynamically in findFlavorMention() to support plurals

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
};

function findFlavorMention(productName) {
  // Exclure les produits "Chocolate X%", "Dark Chocolate Y%", etc.
  if (/chocolate.+\d+\s*%/i.test(productName)) {
    return [];
  }

  const nameNorm = normalize(productName);
  console.log('[DEBUG] findFlavorMention input:', productName);
  console.log('[DEBUG] nameNorm:', nameNorm);

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
    console.log('[DEBUG] directMatch found:', match[1]);
    flavors.add(match[1].trim());
  }

  const result = Array.from(flavors);
  console.log('[DEBUG] findFlavorMention result:', result);
  return result;
}

// Variante(s) plurielles d'un mot, pour matcher "fraise"/"fraises" mais aussi
// "blueberry"/"blueberries" (pluriel anglais en -y -> -ies).
function pluralPattern(word) {
  const alternatives = [word, `${word}s`];
  if (word.endsWith('y')) alternatives.push(`${word.slice(0, -1)}ies`);
  return alternatives.join('|');
}

// Vrai si le mot n'apparaît dans les ingrédients que collé à "arôme(s)",
// jamais comme ingrédient réel autonome.
function onlyAppearsAsArome(word, ingredientsNorm) {
  const allVariants = INGREDIENT_VARIANTS[word] || [word];
  const variants = allVariants.map(v => pluralPattern(v)).join('|');
  const wordRe = new RegExp(`\\b(?:${variants})\\b`, 'g');
  const occurrences = ingredientsNorm.match(wordRe) || [];
  if (occurrences.length === 0) return true; // absent = pareil qu'arôme seul
  const aromeContextRe = new RegExp(`arom[ae]s?[^,]{0,25}\\b(?:${variants})\\b`, 'g');
  const aromeOccurrences = ingredientsNorm.match(aromeContextRe) || [];
  return aromeOccurrences.length >= occurrences.length;
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

const LEGAL_NOTE_FLAVOR =
  'La mention d\'un ingrédient dans le nom ("saveur / goût X", ou le nom direct d\'un fruit/arôme) décrit une saveur perçue, pas un ingrédient garanti. Le règlement (UE) n°1169/2011 exige seulement que "arôme" figure dans la liste - pas qu\'il précise sa source.';

/**
 * @param {string} productName
 * @param {string} ingredientsText
 * @returns {{ verdict: 'clean'|'warning'|'misleading'|'unknown', headline: string, legalNote?: string, detail?: object }}
 */
function detectVerdict(productName, ingredientsText) {
  console.log('[DEBUG] detectVerdict called with:', { productName, ingredientsTextLength: ingredientsText?.length });

  // Exclure les produits "Chocolate X%" - chocolat pur, pas une saveur
  if (/chocolate.+\d+\s*%/i.test(productName)) {
    return {
      verdict: 'clean',
      headline: 'Le nom du produit correspond à sa composition réelle',
    };
  }

  const nameNorm = normalize(productName);
  const ingredientsNorm = normalize(ingredientsText);

  console.log('[DEBUG] ingredientsNorm (first 200 chars):', ingredientsNorm?.substring(0, 200));

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

  const flavors = findFlavorMention(productName);
  console.log('[DEBUG] Flavors found:', flavors);

  if (flavors.length > 0) {
    // Exclure si c'est "Chocolate X%" - chocolat pur, pas une saveur
    const isChocolatePercent = flavors.includes('chocolate') && /\d+\s*%/.test(productName);

    if (!isChocolatePercent) {
      const missingFlavors = [];
      const suspiciousFlavors = [];

      for (const flavor of flavors) {
        const position = findIngredientPosition(flavor, ingredientsNorm);
        console.log(`[DEBUG] Flavor "${flavor}": position =`, position);
        if (position) {
          // Ingrédient trouvé dans la liste → CLEAN (présent réellement)
          // Peu importe la quantité/position, si c'est dans la liste, c'est pas de la tromperie
        } else if (onlyAppearsAsArome(flavor, ingredientsNorm)) {
          console.log(`[DEBUG] Flavor "${flavor}": only appears as arome`);
          // Pas trouvé comme ingrédient, seulement comme arôme → missing
          missingFlavors.push(flavor);
        }
      }

      // Si des saveurs sont manquantes
      if (missingFlavors.length > 0) {
        // Exception: si le nom dit "aromatisé" / "saveur" / "goût" / "parfum", c'est normal que ce soit que des arômes
        // (tous ces termes signalent un produit aromatisé, légalement conforme)
        const isAromatized = /arom|saveur|gout|parfum/i.test(nameNorm);
        if (isAromatized) {
          // C'est un produit aromatisé, ce n'est pas une fraude
          const firstFlavorPos = findIngredientPosition(missingFlavors[0], ingredientsNorm);
          return {
            verdict: 'clean',
            headline: `Produit aromatisé - arôme${missingFlavors.length > 1 ? 's' : ''} de ${missingFlavors.join(', ')}`,
            legalNote: LEGAL_NOTE_FLAVOR,
            detail: {
              rule: 'ingredient-confirme',
              matched: missingFlavors.join(', '),
              compareSuggest: missingFlavors.join(', '),
              compareReal: `Arôme${missingFlavors.length > 1 ? 's' : ''} - conforme`,
              ...(firstFlavorPos && { index: firstFlavorPos.index, total: firstFlavorPos.total, ratio: firstFlavorPos.ratio }),
            },
          };
        }

        return {
          verdict: 'misleading',
          headline: missingFlavors.length === 1
            ? `"${missingFlavors[0]}" absent - seulement un arôme`
            : `${missingFlavors.length} saveur${missingFlavors.length > 1 ? 's' : ''} absent${missingFlavors.length > 1 ? 'es' : ''} - seulement des arômes`,
          legalNote: LEGAL_NOTE_FLAVOR,
          detail: {
            rule: 'saveur-sans-ingredient',
            matched: missingFlavors.join(', '),
            compareSuggest: missingFlavors.join(', '),
            compareReal: 'Arômes seuls / absents',
          },
        };
      }

      // Toutes les saveurs sont présentes correctement
      const firstFlavorPos = findIngredientPosition(flavors[0], ingredientsNorm);
      const positions = flavors
        .map(flavor => {
          const pos = findIngredientPosition(flavor, ingredientsNorm);
          return pos ? `${flavor} pos ${pos.index + 1}/${pos.total}` : flavor;
        })
        .join(', ');

      return {
        verdict: 'clean',
        headline: flavors.length === 1
          ? `"${flavors[0]}" confirmé dans la composition réelle`
          : `Toutes les saveurs confirmées dans la composition réelle`,
        legalNote: LEGAL_NOTE_POSITION,
        detail: {
          rule: 'ingredient-confirme',
          matched: flavors.join(', '),
          compareSuggest: flavors.join(', '),
          compareReal: positions,
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
