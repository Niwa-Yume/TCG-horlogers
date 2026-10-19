import { expect, it } from 'vitest';
import { de, generateQuestions, type QCard } from './questions';

const maison = (slug: string, year: number, founder: string): QCard => ({
  slug,
  type: 'MAISON',
  nameFr: slug,
  nameEn: slug,
  facts: {
    year,
    yearEnd: null,
    entityFr: founder,
    entityEn: founder,
    countryFr: 'Suisse',
    countryEn: 'Switzerland',
  },
});

const cards = [
  maison('a', 1839, 'Antoni Patek'),
  maison('b', 1775, 'Abraham-Louis Breguet'),
  maison('c', 1833, 'Antoine LeCoultre'),
  maison('d', 1905, 'Hans Wilsdorf'),
  maison('e', 1848, 'Louis Brandt'),
];

it('génère des QCM à 4 choix, réponse incluse, sans doublon, de façon déterministe', () => {
  const q = generateQuestions(cards);
  const a = q.get('a')!;
  expect(a.map((x) => x.id)).toEqual(['q_a_year', 'q_a_entity']); // pays : pas assez de mauvaises réponses
  for (const x of a) {
    expect(x.choicesFr).toHaveLength(4);
    expect(new Set(x.choicesFr).size).toBe(4);
  }
  expect(a[0]!.choicesFr[a[0]!.answerIndex]).toBe('1839');
  expect(a[1]!.choicesEn[a[1]!.answerIndex]).toBe('Antoni Patek');
  // années plausibles : les plus proches, à 3 ans au moins
  expect([...a[0]!.choicesFr].sort()).toEqual(['1775', '1833', '1839', '1848']);
  expect(generateQuestions(cards)).toEqual(q);
});

it('élide « de » devant une voyelle', () => {
  expect(de('Édouard Bovet')).toBe('d’Édouard Bovet');
  expect(de('Thomas Mudge')).toBe('de Thomas Mudge');
});
