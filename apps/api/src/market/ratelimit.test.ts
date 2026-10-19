// Test d'intégration : tourne seulement avec une base (`pnpm --filter @wm/api test:db`).
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { overLimit, purgeCounts } from './ratelimit';

describe.skipIf(!process.env.DATABASE_URL)('limite d’actions', () => {
  // deux clients Prisma : deux processus API qui partagent la même base
  const [p1, p2] = [new PrismaClient(), new PrismaClient()];
  const key = `s:test-${Date.now()}`;
  afterAll(async () => {
    await p1.actionCount.deleteMany({ where: { key: { startsWith: 's:test-' } } });
    await Promise.all([p1.$disconnect(), p2.$disconnect()]);
  });

  it('30 actions par minute pour une session, comptées ensemble par tous les processus', async () => {
    const t = Date.UTC(2026, 9, 19, 12, 0, 5);
    const results = await Promise.all(
      Array.from({ length: 31 }, (_, i) => overLimit(i % 2 ? p1 : p2, [key], t)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await overLimit(p1, [key], t + 60_000)).toBe(false); // minute suivante
    await purgeCounts(p1, t + 10 * 60_000);
    expect(await p1.actionCount.count({ where: { key } })).toBe(0);
  });
});
