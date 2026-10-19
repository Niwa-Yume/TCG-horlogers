// Test d'intégration : tourne seulement avec une base (DATABASE_URL), par ex. `pnpm --filter @wm/api test:db`.
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { attachIdentity } from './accounts';

describe.skipIf(!process.env.DATABASE_URL)('attachIdentity', () => {
  const db = new PrismaClient();
  const pid = `test-${Date.now()}`;
  let accountId = '';
  afterAll(async () => {
    await db.cardInstance.deleteMany({ where: { ownerId: accountId } });
    await db.ledgerEntry.deleteMany({ where: { userId: accountId } });
    await db.user.deleteMany({ where: { id: accountId } });
    await db.$disconnect();
  });
  const guest = async (rubis: number) => {
    const card = await db.card.findFirstOrThrow();
    const g = await db.user.create({ data: { displayName: 'test-guest', rubis } });
    await db.cardInstance.create({ data: { cardId: card.id, ownerId: g.id } });
    await db.ledgerEntry.create({ data: { userId: g.id, delta: rubis, reason: 'DAILY' } });
    return g;
  };

  it("promeut l'invité au premier passage, puis verse un second invité dans le compte", async () => {
    const g1 = await guest(20);
    const acc = await attachIdentity(db, g1.id, { provider: 'google', providerId: pid, name: 'Ada' });
    accountId = acc.id;
    expect([acc.id, acc.isGuest, acc.displayName]).toEqual([g1.id, false, 'Ada']);

    const g2 = await guest(35);
    const merged = await attachIdentity(db, g2.id, { provider: 'google', providerId: pid, name: 'Ada' });
    expect(merged.id).toBe(acc.id);
    expect(merged.rubis).toBe(55);
    expect(await db.cardInstance.count({ where: { ownerId: acc.id } })).toBe(2);
    expect(
      (await db.ledgerEntry.aggregate({ where: { userId: acc.id }, _sum: { delta: true } }))._sum.delta,
    ).toBe(55);
    expect(await db.user.findUnique({ where: { id: g2.id } })).toBeNull();

    expect(
      (await attachIdentity(db, acc.id, { provider: 'google', providerId: pid, name: 'Ada' })).rubis,
    ).toBe(55);
  });
});
