// Carte en base → carte servie : langue choisie, overrides appliqués, statut respecté.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from '@prisma/client';
import type { CardDetail, CardView, Lang } from '@wm/shared';

type Localized = { fr?: string; en?: string } | null;

export function toView(c: Card, lang: Lang, total: number): CardView {
  const L = lang === 'fr';
  const name = (c.overrideName as Localized)?.[lang] ?? (L ? c.nameFr : c.nameEn);
  return {
    slug: c.slug,
    number: c.number,
    total,
    type: c.type,
    rarity: c.rarity,
    name,
    // un nom remplacé remplace aussi la légende du cadran
    caption: (c.overrideName as Localized)?.[lang] ?? (L ? c.captionFr : c.captionEn) ?? name,
    summary: (c.overrideText as Localized)?.[lang] ?? (L ? c.summaryFr : c.summaryEn),
    author: c.author,
    year: c.year,
    yearEnd: c.yearEnd,
    yearCirca: c.yearCirca,
    dialPlace: L ? c.dialPlaceFr : c.dialPlaceEn,
    dialImage: c.overrideImage ?? c.dialImage,
    stats: {
      precision: c.precision,
      complication: c.complication,
      innovation: c.innovation,
      prestige: c.prestige,
      heritage: c.heritage,
    },
    isFlagship: c.isFlagship,
  };
}

export function toDetail(c: Card, lang: Lang, total: number): CardDetail {
  return {
    ...toView(c, lang, total),
    anecdote: lang === 'fr' ? c.anecdoteFr : c.anecdoteEn,
    sourceUrl: (lang === 'fr' ? c.sourceUrlFr : c.sourceUrlEn) ?? c.sourceUrlFr ?? c.sourceUrlEn,
    license: c.license,
  };
}

export const langOf = (v: unknown): Lang => (v === 'en' ? 'en' : 'fr');

// ---------- Planches de cadran : plages de dates (tools/dial-painter/plates.json) ----------

interface Plate {
  from: number;
  to: number;
  landmarks: string[];
}

const PLATES_FILE = join(import.meta.dirname, '..', '..', '..', 'tools', 'dial-painter', 'plates.json');
export const plates: Record<string, Plate> = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(PLATES_FILE, 'utf8')) as Record<string, Plate>).filter(
    ([k]) => !k.startsWith('_'),
  ),
);

/** Refuse une scène anachronique : la date du cadran doit tenir dans la plage de la planche. */
export function checkPlate(plate: string | null, dialYear: number | null, table = plates): string | null {
  if (!plate) return null;
  const p = table[plate];
  if (!p) return `Planche inconnue : ${plate}`;
  if (dialYear == null) return `Planche ${plate} : année du cadran requise`;
  if (dialYear < p.from || dialYear > p.to)
    return `Planche ${plate} valable de ${p.from} à ${p.to} (${p.landmarks.join(', ')}) : ${dialYear} est hors plage`;
  return null;
}
