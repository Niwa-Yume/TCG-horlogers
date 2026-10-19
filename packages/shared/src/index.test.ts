import { describe, expect, it } from 'vitest';
import {
  BOOSTER_ODDS,
  CRITERIA,
  STAT_BUDGET,
  boosterState,
  centuryOf,
  computeStats,
  raritiesByPageviews,
  RARITIES,
} from './index';

describe('raritiesByPageviews', () => {
  it('suit les percentiles 1 / 5 / 15 / 40 %', () => {
    const views = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`c${i}`, 1000 - i]));
    const r = Object.values(raritiesByPageviews(views));
    const count = (x: string) => r.filter((v) => v === x).length;
    expect(count('GRAND_FEU')).toBe(2);
    expect(count('CLOISONNE')).toBe(8);
    expect(count('GRISAILLE')).toBe(20);
    expect(count('MARQUETERIE')).toBe(50);
    expect(count('GRAVURE')).toBe(120);
    expect(raritiesByPageviews(views).c0).toBe('GRAND_FEU');
  });
});

describe('computeStats', () => {
  it('respecte le budget, les bornes et le déterminisme', () => {
    for (const rarity of RARITIES) {
      const s = computeStats('tourbillon', 'COMPLICATION', rarity);
      expect(CRITERIA.reduce((a, c) => a + s[c], 0)).toBe(STAT_BUDGET[rarity]);
      expect(Math.min(...Object.values(s))).toBeGreaterThanOrEqual(1);
      expect(Math.max(...Object.values(s))).toBeLessThanOrEqual(10);
      expect(computeStats('tourbillon', 'COMPLICATION', rarity)).toEqual(s);
    }
  });

  it('favorise les critères forts du type', () => {
    let focus = 0,
      other = 0;
    for (let i = 0; i < 300; i++) {
      const s = computeStats(`m${i}`, 'MAISON', 'GRISAILLE');
      focus += s.prestige + s.heritage;
      other += s.precision + s.complication + s.innovation;
    }
    expect(focus / 2).toBeGreaterThan(other / 3);
  });
});

it('les probabilités de tirage font 100 %', () => {
  expect(Object.values(BOOSTER_ODDS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
});

describe('boosterState', () => {
  const t0 = new Date('2026-10-19T10:00:00Z');
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  it('recharge un booster toutes les 10 minutes, sans dépasser 10', () => {
    expect(boosterState(2, t0, at(9)).stock).toBe(2);
    expect(boosterState(2, t0, at(10))).toEqual({ stock: 3, refill: at(10), nextAt: at(20) });
    expect(boosterState(2, t0, at(25)).nextAt).toEqual(at(30));
    expect(boosterState(9, t0, at(500))).toEqual({ stock: 10, refill: at(500), nextAt: null });
  });
  it("ne laisse pas courir l'ancre quand le stock est plein", () => {
    expect(boosterState(10, at(-1000), t0)).toEqual({ stock: 10, refill: t0, nextAt: null });
  });
});

it('siècles', () => {
  expect([centuryOf(1755), centuryOf(1800), centuryOf(1801), centuryOf(null)]).toEqual([18, 18, 19, 0]);
});
