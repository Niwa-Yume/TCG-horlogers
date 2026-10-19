// Test d'intégration du marché : tourne seulement avec une base (`pnpm --filter @wm/api test:db`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  acceptTrade,
  cancelAuction,
  closeTrade,
  createAuction,
  placeBid,
  proposeTrade,
  sweep,
} from './market';

describe.skipIf(!process.env.DATABASE_URL)('marché', () => {
  const db = new PrismaClient();
  const users: string[] = [];
  const old = new Date(Date.now() - 30 * 24 * 3600_000);
  let card = '';

  const player = async (rubis: number, signedUpAt: Date | null = old, isGuest = false) => {
    const u = await db.user.create({
      data: { displayName: `test-market-${users.length}`, rubis, isGuest, signedUpAt },
    });
    users.push(u.id);
    return u.id;
  };
  const instance = async (ownerId: string) =>
    (await db.cardInstance.create({ data: { cardId: card, ownerId } })).id;
  const rubis = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).rubis;
  const ledger = async (id: string) =>
    (await db.ledgerEntry.aggregate({ where: { userId: id }, _sum: { delta: true } }))._sum.delta ?? 0;
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: Error) => e.message,
    );

  beforeAll(async () => {
    process.env.SELL_DELAY_HOURS = '72'; // indépendant du .env local (0 h en développement)
    card = (await db.card.findFirstOrThrow({ where: { rarity: 'GRAVURE', status: 'ACTIVE' } })).id;
  });
  afterAll(async () => {
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.bid.deleteMany({ where: { bidderId: { in: users } } });
    await db.auction.deleteMany({ where: { sellerId: { in: users } } });
    await db.trade.deleteMany({ where: { fromId: { in: users } } });
    await db.cardInstance.deleteMany({ where: { ownerId: { in: users } } });
    await db.ledgerEntry.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  it('enchère : séquestre, remboursement de l’enchérisseur battu, vente avec 5 % brûlés', async () => {
    const seller = await player(0);
    const alice = await player(500);
    const bob = await player(500);
    const inst = await instance(seller);
    const a = await createAuction(db, seller, inst, 100);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: inst } })).lock).toBe(`auction:${a.id}`);
    expect(await code(createAuction(db, seller, inst, 100))).toBe('locked');

    expect(await code(placeBid(db, alice, a.id, 99))).toBe('bid-too-low');
    expect(await code(placeBid(db, seller, a.id, 200))).toBe('own-auction');
    await placeBid(db, alice, a.id, 100);
    expect(await rubis(alice)).toBe(400);
    expect(await code(placeBid(db, alice, a.id, 120))).toBe('already-leading');
    expect(await code(placeBid(db, bob, a.id, 104))).toBe('bid-too-low'); // +5 %
    await placeBid(db, bob, a.id, 200);
    expect([await rubis(alice), await rubis(bob)]).toEqual([500, 300]);
    expect(await code(cancelAuction(db, seller, a.id))).toBe('has-bids');

    // l'enchère n'est réglée qu'à échéance
    expect((await sweep(db)).settled).toBe(0);
    await db.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await sweep(db);
    const sold = await db.auction.findUniqueOrThrow({ where: { id: a.id } });
    const after = await db.cardInstance.findUniqueOrThrow({ where: { id: inst } });
    expect(sold.status).toBe('SOLD');
    expect([after.ownerId, after.lock]).toEqual([bob, null]);
    expect(await rubis(seller)).toBe(190); // 200 − 10 de taxe brûlée
    // le registre explique chaque solde au Rubis près
    for (const u of [seller, alice, bob])
      expect(await ledger(u)).toBe((await rubis(u)) - (u === seller ? 0 : 500));
    expect(await code(placeBid(db, alice, a.id, 500))).toBe('closed');
  });

  it('concurrence : deux mises simultanées au même prix, une seule passe, aucun Rubis perdu', async () => {
    const seller = await player(0);
    const [x, y] = [await player(100), await player(100)];
    const a = await createAuction(db, seller, await instance(seller), 50);
    const results = await Promise.all([code(placeBid(db, x, a.id, 50)), code(placeBid(db, y, a.id, 50))]);
    expect(results.sort()).toEqual(['bid-too-low', 'ok']);
    expect((await rubis(x)) + (await rubis(y))).toBe(150);
    expect(await db.bid.count({ where: { auctionId: a.id } })).toBe(1);
  });

  it('prolongation : une mise dans les 5 dernières minutes repousse la fin', async () => {
    const seller = await player(0);
    const x = await player(100);
    const a = await createAuction(db, seller, await instance(seller), 10);
    await db.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() + 30_000) } });
    const after = await placeBid(db, x, a.id, 10);
    expect(after.endsAt.getTime()).toBeGreaterThan(Date.now() + 4.9 * 60_000);
    // loin de la fin, rien ne bouge
    const b = await createAuction(db, seller, await instance(seller), 10);
    expect((await placeBid(db, x, b.id, 10)).endsAt).toEqual(b.endsAt);
  });

  it('notifications : surenchéri, vendu, gagné, échange reçu, accepté', async () => {
    const seller = await player(0);
    const [x, y] = [await player(100), await player(100)];
    const a = await createAuction(db, seller, await instance(seller), 10);
    await placeBid(db, x, a.id, 10);
    await placeBid(db, y, a.id, 20);
    await db.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await sweep(db);
    const kinds = async (u: string) =>
      (await db.notification.findMany({ where: { userId: u }, orderBy: { createdAt: 'asc' } })).map(
        (n) => n.kind,
      );
    expect(await kinds(x)).toEqual(['OUTBID']);
    expect(await kinds(y)).toEqual(['AUCTION_WON']);
    expect(await kinds(seller)).toEqual(['AUCTION_SOLD']);
    const sold = await db.notification.findFirstOrThrow({ where: { userId: seller } });
    expect(sold.data).toMatchObject({ amount: 20, net: 19 });

    const t = await proposeTrade(db, x, y, [await instance(x)], [await instance(y)]);
    expect(await kinds(y)).toContain('TRADE_RECEIVED');
    await acceptTrade(db, y, t.id);
    expect((await kinds(x)).at(-1)).toBe('TRADE_ACCEPTED');
  });

  it('plusieurs processus règlent en même temps : la vente n’est réglée qu’une fois', async () => {
    const seller = await player(0);
    const x = await player(100);
    const a = await createAuction(db, seller, await instance(seller), 50);
    await placeBid(db, x, a.id, 50);
    await db.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const other = new PrismaClient(); // un second processus API
    await Promise.all([sweep(db), sweep(other), sweep(db)]);
    await other.$disconnect();
    expect(await rubis(seller)).toBe(47);
    expect(await db.notification.count({ where: { userId: seller, kind: 'AUCTION_SOLD' } })).toBe(1);
  });

  it('enchère sans mise : la carte revient au vendeur ; annulation possible avant toute mise', async () => {
    const seller = await player(0);
    const [i1, i2] = [await instance(seller), await instance(seller)];
    const a1 = await createAuction(db, seller, i1, 10);
    const a2 = await createAuction(db, seller, i2, 10);
    await cancelAuction(db, seller, a2.id);
    await db.auction.update({ where: { id: a1.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await sweep(db);
    expect((await db.auction.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('EXPIRED');
    const both = await db.cardInstance.findMany({ where: { id: { in: [i1, i2] } } });
    expect(both.every((i) => i.ownerId === seller && i.lock === null)).toBe(true);
  });

  it('protections : invité et compte trop récent ne vendent pas ; on ne vend pas la carte d’un autre ; prix plancher', async () => {
    const guest = await player(0, null, true);
    const fresh = await player(0, new Date());
    const owner = await player(0);
    expect(await code(createAuction(db, guest, await instance(guest), 50))).toBe('account-required');
    expect(await code(createAuction(db, fresh, await instance(fresh), 50))).toBe('too-new');
    expect(await code(createAuction(db, owner, await instance(fresh), 50))).toBe('not-yours');
    expect(await code(createAuction(db, owner, await instance(owner), 5))).toBe('bad-price');
    const poor = await player(3);
    const a = await createAuction(db, owner, await instance(owner), 10);
    expect(await code(placeBid(db, poor, a.id, 10))).toBe('not-enough-rubis');
    expect(await code(placeBid(db, guest, a.id, 10))).toBe('account-required');
  });

  it('échange : verrou chez l’auteur, double confirmation, refus qui libère, carte changée entre-temps', async () => {
    const a = await player(0);
    const b = await player(0);
    const [ia, ib] = [await instance(a), await instance(b)];
    const t = await proposeTrade(db, a, b, [ia], [ib]);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: ia } })).lock).toBe(`trade:${t.id}`);
    expect(await code(createAuction(db, a, ia, 10))).toBe('locked');
    expect(await code(acceptTrade(db, a, t.id))).toBe('not-yours');
    await acceptTrade(db, b, t.id);
    const [na, nb] = await Promise.all(
      [ia, ib].map((id) => db.cardInstance.findUniqueOrThrow({ where: { id } })),
    );
    expect([na!.ownerId, na!.lock, nb!.ownerId]).toEqual([b, null, a]);

    const t2 = await proposeTrade(db, a, b, [ib], [ia]);
    await closeTrade(db, b, t2.id, 'DECLINED');
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: ib } })).lock).toBeNull();

    // la carte demandée part aux enchères avant l'acceptation : l'échange échoue sans rien déplacer
    const t3 = await proposeTrade(db, a, b, [ib], [ia]);
    await createAuction(db, b, ia, 10);
    expect(await code(acceptTrade(db, b, t3.id))).toBe('changed');
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: ib } })).ownerId).toBe(a);
  });
});
