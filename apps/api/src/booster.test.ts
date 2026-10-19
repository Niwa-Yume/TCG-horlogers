import { describe, expect, it } from 'vitest';
import { RARITIES, rarityRank, seededRandom, type Rarity } from '@wm/shared';
import { drawBooster, type PoolCard } from './booster';

const pool: PoolCard[] = RARITIES.flatMap((r, i) =>
  Array.from({ length: [120, 50, 20, 8, 3][i]! }, (_, k) => ({ id: `${r}-${k}`, rarity: r as Rarity })),
);
const rng = (seed: string) => {
  const r = seededRandom(seed);
  return (n: number) => Math.floor(r() * n);
};

describe('drawBooster', () => {
  it('tire 5 cartes distinctes, la plus rare en dernier', () => {
    const b = drawBooster(pool, rng('a'));
    expect(b).toHaveLength(5);
    expect(new Set(b.map((c) => c.id)).size).toBe(5);
    expect(b.map((c) => rarityRank(c.rarity))).toEqual([...b.map((c) => rarityRank(c.rarity))].sort());
  });

  it('suit à peu près les probabilités', () => {
    const r = rng('odds');
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i++)
      for (const c of drawBooster(pool, r)) count[c.rarity] = (count[c.rarity] ?? 0) + 1;
    expect(count.GRAVURE! / 20000).toBeCloseTo(0.6, 1);
    expect(count.MARQUETERIE! / 20000).toBeCloseTo(0.25, 1);
    expect(count.GRAND_FEU! / 20000).toBeLessThan(0.02);
  });

  it('garantit une Grisaille au moins au premier booster', () => {
    for (let i = 0; i < 200; i++) {
      const b = drawBooster(pool, rng(`g${i}`), 'GRISAILLE');
      expect(rarityRank(b.at(-1)!.rarity)).toBeGreaterThanOrEqual(rarityRank('GRISAILLE'));
      expect(b).toHaveLength(5);
    }
  });

  it('se débrouille avec un petit catalogue', () => {
    expect(drawBooster(pool.slice(0, 3), rng('x'))).toHaveLength(3);
  });
});
