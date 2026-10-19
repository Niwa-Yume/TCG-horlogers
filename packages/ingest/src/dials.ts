// Quel cadran peint pour quelle carte : une planche (lieu), une année (la scène), une graine (la variante).
// Le lieu vient de Wikidata (lieu de travail ou de naissance, siège ou lieu de fondation, maison du
// modèle) ; une ville sans planche, ou une année hors de la plage historique d'une planche, donne l'établi.
import { createHash } from 'node:crypto';
import type { CardType } from '@wm/shared';

export interface DialInput {
  slug: string;
  type: CardType;
  nameFr: string;
  nameEn: string;
  year: number | null;
  yearEnd: number | null;
  placeFr: string | null;
  placeEn: string | null;
  /** Lieu de naissance (P19) : la scène est l'année de naissance, pas l'âge de 35 ans. */
  birthplace?: boolean;
  /** Siège actuel seulement (P159, sans lieu de fondation) : la ville sans l'année, qui pourrait être fausse. */
  currentSeat?: boolean;
  countryFr: string | null;
  countryEn: string | null;
}

export interface Dial {
  plate: string;
  plateSeed: number;
  dialYear: number | null;
  dialPlaceFr: string | null;
  dialPlaceEn: string | null;
}

export type PlateRanges = Record<string, { from: number; to: number }>;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Villes (libellé français ou anglais, sans accents) → planche. */
const CITIES: [RegExp, string][] = [
  [/^(londres|london|city of london|westminster|clerkenwell|southwark)$/, 'londres-tamise'],
  [/^(paris|.*arrondissement de paris)$/, 'paris-cite'],
  [/^(geneve|geneva|carouge|plan-les-ouates|meyrin|vernier|chene-bourg|lancy)$/, 'geneve-rade'],
  [/^(le sentier|le brassus|le chenit|l'abbaye|le lieu|le pont|vallee de joux|les bioux|l'orient)$/, 'vallee-de-joux'],
  [/^la chaux-de-fonds$/, 'chaux-de-fonds'],
  // vallons du Jura : la planche du Locle, sans monument propre au Locle
  [/^(le locle|saint-imier|villeret|sonvilier|renan|tramelan|fleurier|motiers|couvet|sainte-croix|les brenets|les ponts-de-martel|porrentruy|moutier|tavannes|reconvilier|saignelegier|le noirmont|les breuleux|fontainemelon|cernier|corgemont|cortebert|l'auberson|travers|val-de-travers|val-de-ruz)$/, 'le-locle'],
  [/^(neuchatel|colombier|auvernier|peseux|boudry|cortaillod|marin-epagnier)$/, 'neuchatel'],
  [/^(bienne|biel|biel\/bienne|nidau|granges|grenchen|soleure|solothurn|lengnau|bettlach|selzach)$/, 'bienne'],
  [/^(schaffhouse|schaffhausen)$/, 'schaffhouse'],
  [/^(glashutte)$/, 'glashutte'],
];

/** Montres de plongée et de marine : la scène est en mer. */
const MARINE = /(submariner|sea[- ]?dweller|seamaster|yacht|fathoms|ocean|aqua|diver|plong|marine|navy)/i;

export const plateForPlace = (place: string | null) => {
  if (!place) return null;
  const p = norm(place);
  return CITIES.find(([re]) => re.test(p))?.[1] ?? null;
};

export const seedOf = (slug: string) => parseInt(createHash('sha1').update(slug).digest('hex').slice(0, 8), 16) % 100_000;

export function assignDial(c: DialInput, ranges: PlateRanges): Dial {
  // l'année de la scène : un horloger dans sa ville de travail vers 35 ans (de son vivant) ;
  // dans sa ville natale, l'année de sa naissance (on ne sait pas où il était ensuite)
  const atWork = c.type === 'WATCHMAKER' && c.year != null && !c.birthplace;
  const circa = atWork;
  const year = c.year == null ? null : atWork ? Math.min(c.year + 35, c.yearEnd ?? Infinity) : c.year;
  const marine = (c.type === 'MODEL' || c.type === 'INVENTION') && MARINE.test(`${c.nameFr} ${c.nameEn}`);
  let plate = marine ? 'en-mer' : (plateForPlace(c.placeFr) ?? plateForPlace(c.placeEn));
  if (!plate) plate = (c.type === 'INVENTION' || c.type === 'COMPLICATION') && year != null && year >= 1670 ? 'observatoire' : 'etabli';
  const r = ranges[plate];
  if (year != null && r && (year < r.from || year > r.to)) plate = 'etabli';

  const [pFr, pEn] = marine ? ['En mer', 'At sea'] : [c.placeFr ?? c.countryFr, c.placeEn ?? c.countryEn];
  const when = (lang: 'fr' | 'en') =>
    year == null || c.currentSeat ? '' : `${circa ? (lang === 'fr' ? 'vers ' : 'c. ') : ''}${year}`;
  const caption = (place: string | null, lang: 'fr' | 'en') =>
    [place, when(lang)].filter(Boolean).join(', ') || null;
  return {
    plate,
    plateSeed: seedOf(c.slug),
    dialYear: year,
    dialPlaceFr: caption(pFr, 'fr'),
    dialPlaceEn: caption(pEn, 'en'),
  };
}
