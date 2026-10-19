import { expect, it } from 'vitest';
import { botAnswer, botChoice, elo } from './bot';
import { CRITERIA, type Criterion, type DuelCard } from './index';

// petit RNG déterministe pour le test (le moteur n'a pas de dépendance)
const seededRandom = (seed: string) => {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 7);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const card = (id: string, v: number): DuelCard => ({
  id,
  stats: Object.fromEntries(CRITERIA.map((c) => [c, v])) as Record<Criterion, number>,
  rarity: 0,
  questions: [],
});
const cards = Object.fromEntries([card('a', 3), card('b', 9), card('c', 5)].map((c) => [c.id, c]));

it("l'automate joue sa meilleure carte la plupart du temps, et garde des crans pour la fin", () => {
  const r = seededRandom('bot');
  const picks = Array.from({ length: 500 }, () =>
    botChoice(['a', 'b', 'c'], 3, false, cards, 'precision', r),
  );
  const best = picks.filter((p) => p.card === 'b').length / 500;
  expect(best).toBeGreaterThan(0.8);
  expect(best).toBeLessThan(0.95);
  expect(botChoice(['a'], 3, true, cards, 'precision', r).notches).toBe(2);
  expect(botChoice(['a'], 1, true, cards, 'precision', r).notches).toBe(1);
  expect(botChoice(['a'], 0, true, cards, 'precision', r).notches).toBe(0);
});

it("l'automate répond juste environ 6 fois sur 10, toujours entre 0 et 3", () => {
  const r = seededRandom('q');
  const answers = Array.from({ length: 1000 }, () => botAnswer(2, r));
  expect(answers.every((a) => a >= 0 && a <= 3)).toBe(true);
  expect(answers.filter((a) => a === 2).length / 1000).toBeCloseTo(0.6, 1);
});

it('Elo : somme constante, le favori gagne peu', () => {
  expect(elo(1000, 1000, 1)).toEqual([1016, 984]);
  expect(elo(1000, 1000, 0.5)).toEqual([1000, 1000]);
  const [a, b] = elo(1400, 1000, 1);
  expect(a - 1400).toBeLessThan(5);
  expect(a + b).toBe(2400);
});
