// QCM générés depuis les faits Wikidata ; mauvaises réponses tirées d'autres cartes du même type.
import { seededRandom, type CardType } from '@wm/shared';

export interface Facts {
  year: number | null;
  yearEnd: number | null;
  entityFr: string | null;
  entityEn: string | null;
  countryFr: string | null;
  countryEn: string | null;
}

export interface QCard {
  slug: string;
  type: CardType;
  nameFr: string;
  nameEn: string;
  facts: Facts;
}

export interface GeneratedQuestion {
  id: string;
  promptFr: string;
  promptEn: string;
  choicesFr: string[];
  choicesEn: string[];
  answerIndex: number;
  source: 'AUTO';
}

type Kind = 'year' | 'entity' | 'country' | 'yearEnd';

const PROMPTS: Partial<Record<CardType, Partial<Record<Kind, [string, string]>>>> = {
  WATCHMAKER: {
    year: ['Quelle est l’année de naissance {de} ?', 'In what year was {n} born?'],
    country: ['À quel pays rattache-t-on {n} ?', 'Which country is {n} associated with?'],
    yearEnd: ['Quelle est l’année de décès {de} ?', 'In what year did {n} die?'],
  },
  MAISON: {
    year: ['En quelle année la maison {n} a-t-elle été fondée ?', 'In what year was {n} founded?'],
    entity: ['Qui a fondé {n} ?', 'Who founded {n}?'],
    country: ['Dans quel pays la maison {n} est-elle établie ?', 'In which country is {n} based?'],
  },
  MODEL: {
    year: ['En quelle année le modèle {n} a-t-il été lancé ?', 'In what year was the {n} launched?'],
    entity: ['Quelle maison fabrique le modèle {n} ?', 'Which company makes the {n}?'],
  },
  INVENTION: {
    year: ['De quand date l’invention suivante : {n} ?', 'When was this invented: {n}?'],
    entity: ['À qui attribue-t-on l’invention suivante : {n} ?', 'Who is credited with inventing this: {n}?'],
  },
  COMPLICATION: {
    year: ['De quand date la complication suivante : {n} ?', 'When was this complication invented: {n}?'],
    entity: [
      'À qui attribue-t-on la complication suivante : {n} ?',
      'Who is credited with this complication: {n}?',
    ],
  },
};

/** « de Thomas Mudge », « d’Édouard Bovet » (h laissé tel quel : muet ou aspiré, on ne devine pas). */
export const de = (name: string) => (/^[aeiouyàâäéèêëîïôöûü]/i.test(name) ? `d’${name}` : `de ${name}`);

const ORDER: Kind[] = ['year', 'entity', 'country', 'yearEnd'];

/** Trois années d'autres cartes, les plus proches mais séparées d'au moins 3 ans entre elles et de la réponse. */
function nearYears(answer: number, pool: number[]): number[] {
  const picked: number[] = [];
  for (const y of [...new Set(pool)].sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || a - b)) {
    if ([answer, ...picked].every((p) => Math.abs(p - y) >= 3)) picked.push(y);
    if (picked.length === 3) break;
  }
  return picked;
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function generateQuestions(cards: QCard[]): Map<string, GeneratedQuestion[]> {
  const out = new Map<string, GeneratedQuestion[]>();
  for (const card of cards) {
    const peers = cards.filter((c) => c.type === card.type && c.slug !== card.slug);
    const list: GeneratedQuestion[] = [];
    for (const kind of ORDER) {
      const prompt = PROMPTS[card.type]?.[kind];
      if (!prompt || list.length === 3) continue;
      const rnd = seededRandom(`${card.slug}:${kind}`);
      let right: [string, string] | null = null;
      let wrong: [string, string][] = [];
      if (kind === 'year' || kind === 'yearEnd') {
        const y = card.facts[kind];
        if (y == null) continue;
        right = [String(y), String(y)];
        wrong = nearYears(
          y,
          peers.map((p) => p.facts[kind]).filter((v): v is number => v != null),
        ).map((v) => [String(v), String(v)]);
      } else {
        const [fr, en] =
          kind === 'entity' ? (['entityFr', 'entityEn'] as const) : (['countryFr', 'countryEn'] as const);
        const a = card.facts[fr],
          b = card.facts[en];
        if (!a || !b) continue;
        right = [a, b];
        const pool = new Map<string, string>();
        for (const p of peers)
          if (p.facts[fr] && p.facts[en] && p.facts[fr] !== a) pool.set(p.facts[fr]!, p.facts[en]!);
        wrong = shuffle([...pool].sort(), rnd).slice(0, 3);
      }
      if (wrong.length < 3) continue;
      const choices = shuffle([right, ...wrong], rnd);
      list.push({
        id: `q_${card.slug}_${kind}`,
        promptFr: prompt[0].replace('{de}', de(card.nameFr)).replace('{n}', card.nameFr),
        promptEn: prompt[1].replace('{n}', card.nameEn),
        choicesFr: choices.map((c) => c[0]),
        choicesEn: choices.map((c) => c[1]),
        answerIndex: choices.indexOf(right),
        source: 'AUTO',
      });
    }
    if (list.length) out.set(card.slug, list);
  }
  return out;
}
