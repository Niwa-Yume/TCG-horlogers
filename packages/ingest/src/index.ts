// Ingestion : Wikidata → Wikipédia (résumés FR/EN) → consultations → rareté, stats, QCM → data/cards.generated.json
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computeStats, raritiesByPageviews, type CardType, type Rarity, type Stats } from '@wm/shared';
import { fetchEntities, pageviews, sitelinks, summary, TYPE_QUERIES, wikiUrl, type Entity } from './sources';
import { generateQuestions, type Facts, type GeneratedQuestion } from './questions';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'data', 'cards.generated.json');

export interface GeneratedCard {
  slug: string;
  number: number;
  type: CardType;
  wikidataId: string | null;
  nameFr: string;
  nameEn: string;
  captionFr: string | null;
  captionEn: string | null;
  summaryFr: string;
  summaryEn: string;
  anecdoteFr: string | null;
  anecdoteEn: string | null;
  author: string | null;
  year: number | null;
  yearEnd: number | null;
  yearCirca: boolean;
  plate: string | null;
  plateSeed: number | null;
  dialYear: number | null;
  dialPlaceFr: string | null;
  dialPlaceEn: string | null;
  dialImage: string | null;
  rarity: Rarity;
  stats: Stats;
  pageviews: number;
  isFlagship: boolean;
  sourceUrlFr: string | null;
  sourceUrlEn: string | null;
  license: string;
  facts: Facts;
  questions: GeneratedQuestion[];
}

type Override = Partial<GeneratedCard> & { slug: string };

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function main() {
  // 1. Entités Wikidata (un type par entité : le premier qui la trouve)
  const seen = new Map<string, Entity>();
  for (const q of TYPE_QUERIES) {
    const list = await fetchEntities(q);
    console.log(`${q.type.padEnd(12)} ${list.length} entités avec article FR et EN`);
    for (const e of list) if (!seen.has(e.wikidataId)) seen.set(e.wikidataId, e);
  }

  // 2. Résumés et consultations
  const cards: GeneratedCard[] = [];
  const slugs = new Set<string>();
  let i = 0;
  for (const e of seen.values()) {
    if (++i % 50 === 0) console.log(`  ${i} / ${seen.size}`);
    const [summaryFr, summaryEn] = await Promise.all([summary('fr', e.titleFr), summary('en', e.titleEn)]);
    if (!summaryFr || !summaryEn) continue;
    const views = (await pageviews('fr', e.titleFr)) + (await pageviews('en', e.titleEn));
    let slug = slugify(e.labelFr) || e.wikidataId.toLowerCase();
    if (slugs.has(slug)) slug += '-' + e.wikidataId.toLowerCase();
    slugs.add(slug);
    const facts: Facts = {
      year: e.year,
      yearEnd: e.yearEnd,
      entityFr: e.entityFr,
      entityEn: e.entityEn,
      countryFr: e.countryFr,
      countryEn: e.countryEn,
    };
    cards.push({
      slug,
      number: 0,
      type: e.type,
      wikidataId: e.wikidataId,
      nameFr: e.labelFr.charAt(0).toUpperCase() + e.labelFr.slice(1),
      nameEn: e.labelEn.charAt(0).toUpperCase() + e.labelEn.slice(1),
      captionFr: null,
      captionEn: null,
      summaryFr,
      summaryEn,
      anecdoteFr: null,
      anecdoteEn: null,
      author: e.type === 'WATCHMAKER' ? null : e.entityFr,
      year: e.year,
      yearEnd: e.type === 'WATCHMAKER' ? e.yearEnd : null,
      yearCirca: false,
      plate: null,
      plateSeed: null,
      dialYear: null,
      dialPlaceFr: null,
      dialPlaceEn: null,
      dialImage: null,
      rarity: 'GRAVURE',
      stats: computeStats(slug, e.type, 'GRAVURE'),
      pageviews: views,
      isFlagship: false,
      sourceUrlFr: wikiUrl('fr', e.titleFr),
      sourceUrlEn: wikiUrl('en', e.titleEn),
      license: 'CC BY-SA 4.0',
      facts,
      questions: [],
    });
  }

  // 3. Rareté par percentile de consultations, puis stats (seed = slug)
  const rarity = raritiesByPageviews(Object.fromEntries(cards.map((c) => [c.slug, c.pageviews])));
  for (const c of cards) {
    c.rarity = rarity[c.slug]!;
    c.stats = computeStats(c.slug, c.type, c.rarity);
  }

  // 4. Cartes phares : les overrides écrasent (ou créent) la carte
  const overrides = JSON.parse(await readFile(join(ROOT, 'flagship.overrides.json'), 'utf8')) as Override[];
  for (const o of overrides) {
    const idx = cards.findIndex((c) => (o.wikidataId && c.wikidataId === o.wikidataId) || c.slug === o.slug);
    const base = idx >= 0 ? cards.splice(idx, 1)[0]! : null;
    const merged = { ...base, ...o, isFlagship: true } as GeneratedCard;
    if (!base && o.wikidataId) {
      // entité hors des requêtes par type : résumé et sources depuis ses articles
      const { titleFr, titleEn } = await sitelinks(o.wikidataId);
      if (titleFr) merged.summaryFr ??= (await summary('fr', titleFr)) ?? undefined!;
      if (titleEn) merged.summaryEn ??= (await summary('en', titleEn)) ?? undefined!;
      if (titleFr) merged.sourceUrlFr ??= wikiUrl('fr', titleFr);
      if (titleEn) merged.sourceUrlEn ??= wikiUrl('en', titleEn);
    }
    merged.facts = {
      ...(base?.facts ?? emptyFacts()),
      year: merged.year,
      entityFr: merged.author,
      entityEn: merged.author,
    };
    for (const k of ['summaryFr', 'summaryEn', 'type', 'rarity', 'stats', 'nameFr', 'nameEn'] as const)
      if (merged[k] == null) throw new Error(`Carte phare ${o.slug} : ${k} manquant`);
    cards.push({ ...defaults(), ...merged });
  }

  // 5. Numéros de série stables : on garde ceux du fichier précédent
  const previous = new Map<string, number>();
  try {
    for (const c of (JSON.parse(await readFile(OUT, 'utf8')) as { cards: GeneratedCard[] }).cards)
      previous.set(c.slug, c.number);
  } catch {
    /* premier passage */
  }
  // un numéro attribué ne sert jamais à une autre carte, même si la sienne disparaît
  const flagNumbers = new Set(cards.filter((c) => c.isFlagship).map((c) => c.number));
  const used = new Set([...flagNumbers, ...previous.values()]);
  for (const c of cards)
    if (!c.isFlagship && previous.has(c.slug) && !flagNumbers.has(previous.get(c.slug)!))
      c.number = previous.get(c.slug)!;
  let next = 1;
  for (const c of [...cards].sort(
    (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.slug.localeCompare(b.slug),
  )) {
    if (c.number) continue;
    while (used.has(next)) next++;
    used.add((c.number = next));
  }

  // 6. QCM
  const questions = generateQuestions(cards);
  for (const c of cards) c.questions = questions.get(c.slug) ?? [];

  cards.sort((a, b) => a.number - b.number);
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cards }, null, 1) + '\n');
  const by = (k: 'type' | 'rarity') =>
    Object.entries(Object.groupBy(cards, (c) => c[k]))
      .map(([x, l]) => `${x} ${l!.length}`)
      .join(', ');
  console.log(`${cards.length} cartes → ${OUT}\n  ${by('type')}\n  ${by('rarity')}`);
  console.log(`  ${cards.reduce((a, c) => a + c.questions.length, 0)} questions (non vérifiées)`);
}

const emptyFacts = (): Facts => ({
  year: null,
  yearEnd: null,
  entityFr: null,
  entityEn: null,
  countryFr: null,
  countryEn: null,
});

const defaults = () => ({
  wikidataId: null,
  captionFr: null,
  captionEn: null,
  anecdoteFr: null,
  anecdoteEn: null,
  author: null,
  year: null,
  yearEnd: null,
  yearCirca: false,
  plate: null,
  plateSeed: null,
  dialYear: null,
  dialPlaceFr: null,
  dialPlaceEn: null,
  dialImage: null,
  pageviews: 0,
  sourceUrlFr: null,
  sourceUrlEn: null,
  license: 'CC BY-SA 4.0',
  questions: [],
});

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
