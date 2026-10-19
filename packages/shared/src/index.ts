// Types partagés et règles pures de rareté et de statistiques.

export const CARD_TYPES = ['WATCHMAKER', 'MAISON', 'MODEL', 'INVENTION', 'COMPLICATION', 'EVENT'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const RARITIES = ['GRAVURE', 'MARQUETERIE', 'GRISAILLE', 'CLOISONNE', 'GRAND_FEU'] as const;
export type Rarity = (typeof RARITIES)[number];

export const CRITERIA = ['precision', 'complication', 'innovation', 'prestige', 'heritage'] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Stats = Record<Criterion, number>;

export type Lang = 'fr' | 'en';

/** Carte telle que l'API la sert : déjà localisée, overrides appliqués. */
export interface CardView {
  slug: string;
  number: number;
  total: number;
  type: CardType;
  rarity: Rarity;
  name: string;
  caption: string;
  summary: string;
  author: string | null;
  year: number | null;
  yearEnd: number | null;
  yearCirca: boolean;
  dialPlace: string | null;
  dialImage: string | null; // sans extension ; le composant ajoute .webp et -408.webp
  stats: Stats;
  isFlagship: boolean;
}

export interface CardDetail extends CardView {
  anecdote: string | null;
  sourceUrl: string | null;
  license: string;
}

export interface CardList {
  total: number;
  items: CardView[];
}

export interface QuestionView {
  id: string;
  card: { slug: string; name: string };
  promptFr: string;
  promptEn: string;
  choicesFr: string[];
  choicesEn: string[];
  answerIndex: number;
  source: string;
  verified: boolean;
}

// ---------- Rareté ----------

/** Seuils de percentile de consultations (rang depuis le haut) → rareté. */
export const RARITY_PERCENTILES: [number, Rarity][] = [
  [0.01, 'GRAND_FEU'],
  [0.05, 'CLOISONNE'],
  [0.15, 'GRISAILLE'],
  [0.4, 'MARQUETERIE'],
  [1, 'GRAVURE'],
];

/** Tirage en booster (Phase 2 : RNG sécurisé côté serveur). */
export const BOOSTER_ODDS: Record<Rarity, number> = {
  GRAVURE: 0.6,
  MARQUETERIE: 0.25,
  GRISAILLE: 0.1,
  CLOISONNE: 0.04,
  GRAND_FEU: 0.01,
};

export const STAT_BUDGET: Record<Rarity, number> = {
  GRAVURE: 20,
  MARQUETERIE: 24,
  GRISAILLE: 28,
  CLOISONNE: 32,
  GRAND_FEU: 36,
};

/** Les deux critères forts de chaque type. */
export const TYPE_FOCUS: Record<CardType, [Criterion, Criterion]> = {
  WATCHMAKER: ['innovation', 'heritage'],
  MAISON: ['prestige', 'heritage'],
  MODEL: ['prestige', 'complication'],
  INVENTION: ['innovation', 'precision'],
  COMPLICATION: ['complication', 'innovation'],
  EVENT: ['heritage', 'prestige'],
};

/** Attribue une rareté à chaque clé selon son rang de consultations (ex æquo : ordre stable). */
export function raritiesByPageviews(views: Record<string, number>): Record<string, Rarity> {
  const keys = Object.keys(views).sort((a, b) => views[b]! - views[a]! || a.localeCompare(b));
  const out: Record<string, Rarity> = {};
  keys.forEach((k, i) => {
    const p = (i + 1) / keys.length;
    out[k] = RARITY_PERCENTILES.find(([max]) => p <= max)![1];
  });
  return out;
}

/** PRNG déterministe (mulberry32) à partir d'une chaîne. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Répartit le budget de la rareté sur les cinq critères (1..10 chacun).
 * Chaque point va à un critère tiré au sort, les deux critères forts du type pesant trois fois plus.
 */
export function computeStats(slug: string, type: CardType, rarity: Rarity): Stats {
  const rnd = seededRandom(slug);
  const focus = TYPE_FOCUS[type];
  const stats = Object.fromEntries(CRITERIA.map((c) => [c, 1])) as Stats;
  for (let left = STAT_BUDGET[rarity] - CRITERIA.length; left > 0; left--) {
    const open = CRITERIA.filter((c) => stats[c] < 10);
    const weights = open.map((c) => (focus.includes(c) ? 3 : 1));
    let r = rnd() * weights.reduce((a, b) => a + b, 0);
    const pick = open.find((_, i) => (r -= weights[i]!) < 0) ?? open[open.length - 1]!;
    stats[pick]++;
  }
  return stats;
}
