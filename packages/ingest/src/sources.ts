// Accès Wikidata / Wikipédia / Wikimedia : User-Agent identifiable, délai entre requêtes, cache disque.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CardType } from '@wm/shared';

// Politique Wikimedia : un User-Agent avec un moyen de contact (INGEST_CONTACT dans .env).
const UA = `WristMastersTCG-ingest/0.1 (${process.env.INGEST_CONTACT ?? 'contact non renseigné'})`;
const CACHE = join(import.meta.dirname, '..', '.cache');
const DELAY_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON avec cache disque. 404 → null (mis en cache aussi). */
export async function getJson<T>(url: string, accept = 'application/json'): Promise<T | null> {
  const file = join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T | null;
  } catch {
    /* pas en cache */
  }
  for (let attempt = 0; ; attempt++) {
    await sleep(DELAY_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept },
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      if (attempt < 4) continue;
      throw e;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) {
      await save(file, null);
      return null;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = (await res.json()) as T;
    await save(file, data);
    return data;
  }
}

async function save(file: string, data: unknown) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

// ---------- SPARQL ----------
// Identifiants vérifiés sur wikidata.org (octobre 2026) :
// Q5 humain · Q157798 horloger (watchmaker) · Q2700922 horloger (clockmaker) · Q41767 horlogerie ·
// Q26965868 montre-bracelet · Q178794 montre · Q136094627 entreprise horlogère · Q1137941 échappement ·
// Q353963 complication · Q2307829 chronomètre de marine · Q3107982 spiral · Q1088223 chronographe.
// Propriétés : P31 nature, P279 sous-classe, P106 occupation, P452 secteur, P569/P570 naissance/décès,
// P571 fondation/création, P575 date d'invention, P112 fondateur, P61 inventeur, P176 fabricant,
// P17 pays, P27 nationalité.

interface TypeQuery {
  type: CardType;
  select: string; // motif SPARQL qui lie ?item
  years: string[]; // propriétés de date, par ordre de préférence
  yearEnd?: string;
  entity?: string; // fondateur, inventeur ou fabricant → « author »
  country?: string;
}

export const TYPE_QUERIES: TypeQuery[] = [
  {
    type: 'WATCHMAKER',
    select: '?item wdt:P31 wd:Q5; wdt:P106 ?o. VALUES ?o { wd:Q157798 wd:Q2700922 }',
    years: ['P569'],
    yearEnd: 'P570',
    country: 'P27',
  },
  {
    type: 'MAISON',
    select:
      '{ ?item wdt:P452 ?i. VALUES ?i { wd:Q41767 wd:Q157798 wd:Q26965868 } } UNION { ?item wdt:P31 wd:Q136094627 } FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }',
    years: ['P571'],
    entity: 'P112',
    country: 'P17',
  },
  {
    type: 'MODEL',
    select: '?item wdt:P31 ?c. VALUES ?c { wd:Q178794 wd:Q26965868 }',
    years: ['P571', 'P577'],
    entity: 'P176',
  },
  {
    type: 'INVENTION',
    select:
      '{ ?item wdt:P279+ wd:Q1137941 } UNION { ?item wdt:P31 wd:Q1137941 } UNION { VALUES ?item { wd:Q2307829 wd:Q3107982 } }',
    years: ['P575', 'P571'],
    entity: 'P61',
  },
  {
    type: 'COMPLICATION',
    select:
      '{ ?item wdt:P31/wdt:P279* wd:Q353963 } UNION { ?item wdt:P279+ wd:Q353963 } UNION { VALUES ?item { wd:Q1088223 } }',
    years: ['P575', 'P571'],
    entity: 'P61',
  },
];

// SPARQL ne sert qu'à lister les entités (requête légère) ; faits et libellés viennent de wbgetentities.
export const sparql = (q: TypeQuery) => `SELECT DISTINCT ?item ?titleFr ?titleEn WHERE {
  ${q.select}
  ?fr schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?titleFr.
  ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?titleEn.
}`;

export interface Entity {
  type: CardType;
  wikidataId: string;
  titleFr: string;
  titleEn: string;
  labelFr: string;
  labelEn: string;
  year: number | null;
  yearEnd: number | null;
  entityFr: string | null;
  entityEn: string | null;
  countryFr: string | null;
  countryEn: string | null;
}

interface Snak {
  rank: string;
  mainsnak: { datavalue?: { value: { time?: string; precision?: number; id?: string } } };
}
interface WdEntity {
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Snak[]>;
}

async function entities(ids: string[], props: string): Promise<Record<string, WdEntity>> {
  const out: Record<string, WdEntity> = {};
  const uniq = [...new Set(ids)].sort();
  for (let i = 0; i < uniq.length; i += 50) {
    const d = await getJson<{ entities: Record<string, WdEntity> }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=fr|en&props=${props}&ids=${uniq.slice(i, i + 50).join('|')}`,
    );
    Object.assign(out, d?.entities);
  }
  return out;
}

const values = (e: WdEntity, prop: string) =>
  (e.claims?.[prop] ?? [])
    .filter((c) => c.rank !== 'deprecated')
    .map((c) => c.mainsnak.datavalue?.value)
    .filter((v) => v != null);

/** Année d'une date Wikidata, seulement si la précision est l'année au moins (9). */
function yearOf(e: WdEntity, props: string[], pick: (ys: number[]) => number): number | null {
  for (const p of props) {
    const ys = values(e, p)
      .filter((v) => v.time && (v.precision ?? 0) >= 9)
      .map((v) => Number(/^([+-]\d+)-/.exec(v.time!)![1]));
    if (ys.length) return pick(ys);
  }
  return null;
}

const firstId = (e: WdEntity, prop?: string) =>
  prop ? (values(e, prop).find((v) => v.id)?.id ?? null) : null;

export async function fetchEntities(q: TypeQuery): Promise<Entity[]> {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparql(q));
  const data = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>(
    url,
    'application/sparql-results+json',
  );
  const rows = new Map<string, { titleFr: string; titleEn: string }>();
  for (const b of data?.results.bindings ?? [])
    rows.set(b.item!.value.split('/').pop()!, { titleFr: b.titleFr!.value, titleEn: b.titleEn!.value });

  const facts = await entities([...rows.keys()], 'labels|claims');
  const refs = [...rows.keys()].flatMap((id) => [
    firstId(facts[id] ?? {}, q.entity),
    firstId(facts[id] ?? {}, q.country),
  ]);
  const names = await entities(
    refs.filter((r): r is string => r != null),
    'labels',
  );
  const label = (id: string | null, lang: string) => (id ? (names[id]?.labels?.[lang]?.value ?? null) : null);

  return [...rows].map(([id, t]) => {
    const e = facts[id] ?? {};
    const ent = firstId(e, q.entity),
      cty = firstId(e, q.country);
    const pair = (ref: string | null) => {
      const fr = label(ref, 'fr'),
        en = label(ref, 'en');
      return fr && en ? [fr, en] : [null, null];
    };
    const [entityFr, entityEn] = pair(ent);
    const [countryFr, countryEn] = pair(cty);
    return {
      type: q.type,
      wikidataId: id,
      ...t,
      labelFr: e.labels?.fr?.value ?? t.titleFr,
      labelEn: e.labels?.en?.value ?? t.titleEn,
      year: yearOf(e, q.years, (ys) => Math.min(...ys)),
      yearEnd: q.yearEnd ? yearOf(e, [q.yearEnd], (ys) => Math.max(...ys)) : null,
      entityFr: entityFr ?? null,
      entityEn: entityEn ?? null,
      countryFr: countryFr ?? null,
      countryEn: countryEn ?? null,
    };
  });
}

/** Titres des articles FR et EN d'une entité (cartes phares hors des requêtes par type). */
export async function sitelinks(id: string): Promise<{ titleFr?: string; titleEn?: string }> {
  const d = await getJson<{ entities: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=frwiki|enwiki&ids=${id}`,
  );
  const l = d?.entities[id]?.sitelinks;
  return { titleFr: l?.frwiki?.title, titleEn: l?.enwiki?.title };
}

// ---------- Wikipédia ----------

const wikiPath = (title: string) => encodeURIComponent(title.replace(/ /g, '_'));
export const wikiUrl = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/wiki/${wikiPath(title)}`;

/** Résumé de l'article (paragraphe d'introduction), null pour une page d'homonymie. */
export async function summary(lang: string, title: string): Promise<string | null> {
  const d = await getJson<{ type: string; extract: string }>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${wikiPath(title)}`,
  );
  return d && d.type !== 'disambiguation' && d.extract ? d.extract : null;
}

/** Moyenne mensuelle des consultations sur les 12 derniers mois complets. */
export async function pageviews(lang: string, title: string, now = new Date()): Promise<number> {
  const ym = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const d = await getJson<{ items: { views: number }[] }>(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${wikiPath(title)}/monthly/${ym(start)}0100/${ym(end)}${String(end.getUTCDate())}00`,
  );
  const items = d?.items ?? [];
  return items.length ? Math.round(items.reduce((a, i) => a + i.views, 0) / 12) : 0;
}
