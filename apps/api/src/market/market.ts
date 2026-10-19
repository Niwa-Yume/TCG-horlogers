// Marché : enchères (séquestre des Rubis, taxe de 5 % brûlée) et échanges à double confirmation.
// Chaque opération : une transaction, des verrous de ligne (SELECT … FOR UPDATE), une LedgerEntry par mouvement de Rubis,
// et un verrou applicatif sur les exemplaires engagés (CardInstance.lock).
import type { Prisma, PrismaClient, User } from '@prisma/client';
import {
  AUCTION_EXTEND_MINUTES,
  AUCTION_HOURS,
  auctionTax,
  minStartPrice,
  nextMinBid,
  SELL_DELAY_HOURS,
  TRADE_HOURS,
} from '@wm/shared';

export class MarketError extends Error {
  constructor(
    public code: string,
    public status = 409,
    public detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
const MAX_PENDING_TRADES = 10;
const MAX_TRADE_CARDS = 5;

/** Verrouille des joueurs dans un ordre fixe (pas d'interblocage). */
async function lockUsers(tx: Tx, ids: (string | null | undefined)[]) {
  for (const id of [...new Set(ids.filter((x): x is string => !!x))].sort())
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${id} FOR UPDATE`;
}

/** Avis au joueur, écrit dans la transaction de l'événement : rien n'est annoncé qui n'a pas eu lieu. */
const notify = (tx: Tx, userId: string, kind: string, data: Record<string, unknown>) =>
  tx.notification.create({ data: { userId, kind, data: data as Prisma.InputJsonValue } });

const sellDelayMs = () => Number(process.env.SELL_DELAY_HOURS ?? SELL_DELAY_HOURS) * HOUR;

/** Un compte connecté peut vendre et échanger une fois le délai passé ; un invité jamais. */
export function sellableAt(u: Pick<User, 'isGuest' | 'signedUpAt' | 'createdAt'>): Date | null {
  if (u.isGuest) return null;
  return new Date((u.signedUpAt ?? u.createdAt).getTime() + sellDelayMs());
}

function assertCanSell(u: User, now: Date) {
  const at = sellableAt(u);
  if (!at) throw new MarketError('account-required', 403);
  if (at > now) throw new MarketError('too-new', 403, { sellableAt: at.toISOString() });
}

// ---------- Enchères ----------

export async function createAuction(
  db: PrismaClient,
  userId: string,
  instanceId: string,
  startPrice: number,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await lockUsers(tx, [userId]);
    assertCanSell(await tx.user.findUniqueOrThrow({ where: { id: userId } }), now);
    const inst = await tx.cardInstance.findUnique({ where: { id: instanceId }, include: { card: true } });
    if (!inst || inst.ownerId !== userId || inst.card.status !== 'ACTIVE')
      throw new MarketError('not-yours', 403);
    if (
      !Number.isInteger(startPrice) ||
      startPrice < minStartPrice(inst.card.rarity) ||
      startPrice > 1_000_000
    )
      throw new MarketError('bad-price', 400, { min: minStartPrice(inst.card.rarity) });
    const auction = await tx.auction.create({
      data: {
        instanceId,
        sellerId: userId,
        startPrice,
        endsAt: new Date(now.getTime() + AUCTION_HOURS * HOUR),
      },
    });
    const locked = await tx.cardInstance.updateMany({
      where: { id: instanceId, lock: null },
      data: { lock: `auction:${auction.id}` },
    });
    if (locked.count !== 1) throw new MarketError('locked');
    return auction;
  });
}

export async function placeBid(
  db: PrismaClient,
  userId: string,
  auctionId: string,
  amount: number,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    const a = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!a || a.status !== 'OPEN' || a.endsAt <= now) throw new MarketError('closed');
    if (a.sellerId === userId) throw new MarketError('own-auction', 403);
    if (a.bestBidder === userId) throw new MarketError('already-leading');
    const min = nextMinBid(a.startPrice, a.bestBid);
    if (!Number.isInteger(amount) || amount < min) throw new MarketError('bid-too-low', 400, { min });
    await lockUsers(tx, [userId, a.bestBidder]);
    const bidder = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (bidder.isGuest) throw new MarketError('account-required', 403);
    if (bidder.rubis < amount) throw new MarketError('not-enough-rubis', 400, { rubis: bidder.rubis });

    // séquestre : la mise est retirée tout de suite, l'enchérisseur battu est remboursé
    await tx.user.update({ where: { id: userId }, data: { rubis: { decrement: amount } } });
    await tx.ledgerEntry.create({ data: { userId, delta: -amount, reason: 'AUCTION_HOLD' } });
    if (a.bestBidder && a.bestBid) {
      await tx.user.update({ where: { id: a.bestBidder }, data: { rubis: { increment: a.bestBid } } });
      await tx.ledgerEntry.create({
        data: { userId: a.bestBidder, delta: a.bestBid, reason: 'AUCTION_REFUND' },
      });
    }
    await tx.bid.create({ data: { auctionId, bidderId: userId, amount } });
    const inst = await tx.cardInstance.findUniqueOrThrow({
      where: { id: a.instanceId },
      select: { cardId: true },
    });
    if (a.bestBidder) await notify(tx, a.bestBidder, 'OUTBID', { auctionId, cardId: inst.cardId, amount });
    // mise de dernière minute : l'enchère se prolonge, pour que l'enchérisseur battu puisse répondre
    const extendTo = new Date(now.getTime() + AUCTION_EXTEND_MINUTES * 60_000);
    return tx.auction.update({
      where: { id: auctionId },
      data: { bestBid: amount, bestBidder: userId, ...(a.endsAt < extendTo && { endsAt: extendTo }) },
    });
  });
}

export async function cancelAuction(db: PrismaClient, userId: string, auctionId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    const a = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!a || a.sellerId !== userId) throw new MarketError('not-yours', 403);
    if (a.status !== 'OPEN') throw new MarketError('closed');
    if (a.bestBid) throw new MarketError('has-bids');
    await tx.cardInstance.updateMany({
      where: { id: a.instanceId, lock: `auction:${a.id}` },
      data: { lock: null },
    });
    return tx.auction.update({ where: { id: a.id }, data: { status: 'CANCELLED', settledAt: new Date() } });
  });
}

/** Règle une enchère échue : vente (taxe brûlée, carte transférée) ou expiration (carte rendue). Idempotent. */
async function settle(tx: Tx, auctionId: string, now: Date) {
  await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
  const a = await tx.auction.findUnique({ where: { id: auctionId } });
  if (!a || a.status !== 'OPEN' || a.endsAt > now) return;
  const unlock = { where: { id: a.instanceId, lock: `auction:${a.id}` } };
  if (!a.bestBidder || !a.bestBid) {
    await tx.cardInstance.updateMany({ ...unlock, data: { lock: null } });
    await tx.auction.update({ where: { id: a.id }, data: { status: 'EXPIRED', settledAt: now } });
    const inst = await tx.cardInstance.findUniqueOrThrow({
      where: { id: a.instanceId },
      select: { cardId: true },
    });
    await notify(tx, a.sellerId, 'AUCTION_EXPIRED', { auctionId: a.id, cardId: inst.cardId });
    return;
  }
  await lockUsers(tx, [a.sellerId]);
  const tax = auctionTax(a.bestBid);
  await tx.user.update({ where: { id: a.sellerId }, data: { rubis: { increment: a.bestBid - tax } } });
  await tx.ledgerEntry.createMany({
    data: [
      { userId: a.sellerId, delta: a.bestBid, reason: 'AUCTION_SELL' },
      { userId: a.sellerId, delta: -tax, reason: 'TAX' }, // brûlée : ne revient à personne
    ],
  });
  await tx.cardInstance.updateMany({
    ...unlock,
    data: { lock: null, ownerId: a.bestBidder, acquiredAt: now },
  });
  await tx.auction.update({ where: { id: a.id }, data: { status: 'SOLD', settledAt: now } });
  const inst = await tx.cardInstance.findUniqueOrThrow({
    where: { id: a.instanceId },
    select: { cardId: true },
  });
  await notify(tx, a.sellerId, 'AUCTION_SOLD', {
    auctionId: a.id,
    cardId: inst.cardId,
    amount: a.bestBid,
    net: a.bestBid - tax,
  });
  await notify(tx, a.bestBidder, 'AUCTION_WON', { auctionId: a.id, cardId: inst.cardId, amount: a.bestBid });
}

// ---------- Échanges ----------

export async function proposeTrade(
  db: PrismaClient,
  fromId: string,
  toId: string,
  offerIds: string[],
  askIds: string[],
  now = new Date(),
) {
  const clean = (ids: unknown) =>
    Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string'))] : [];
  const offer = clean(offerIds);
  const ask = clean(askIds);
  if (!offer.length || !ask.length || offer.length > MAX_TRADE_CARDS || ask.length > MAX_TRADE_CARDS)
    throw new MarketError('bad-trade', 400);
  if (fromId === toId) throw new MarketError('bad-trade', 400);
  return db.$transaction(async (tx) => {
    await lockUsers(tx, [fromId]);
    assertCanSell(await tx.user.findUniqueOrThrow({ where: { id: fromId } }), now);
    const to = await tx.user.findUnique({ where: { id: toId } });
    if (!to || to.isGuest) throw new MarketError('no-player', 404);
    if ((await tx.trade.count({ where: { fromId, status: 'PENDING' } })) >= MAX_PENDING_TRADES)
      throw new MarketError('too-many-trades');
    const asked = await tx.cardInstance.count({
      where: { id: { in: ask }, ownerId: toId, card: { status: 'ACTIVE' } },
    });
    if (asked !== ask.length) throw new MarketError('changed');
    const trade = await tx.trade.create({
      data: {
        fromId,
        toId,
        offerIds: offer,
        askIds: ask,
        expiresAt: new Date(now.getTime() + TRADE_HOURS * HOUR),
      },
    });
    // les cartes proposées sont verrouillées jusqu'à la réponse
    const locked = await tx.cardInstance.updateMany({
      where: { id: { in: offer }, ownerId: fromId, lock: null, card: { status: 'ACTIVE' } },
      data: { lock: `trade:${trade.id}` },
    });
    if (locked.count !== offer.length) throw new MarketError('locked');
    await notify(tx, toId, 'TRADE_RECEIVED', { tradeId: trade.id, from: await nameOf(tx, fromId) });
    return trade;
  });
}

const nameOf = async (tx: Tx, id: string) => (await tx.user.findUniqueOrThrow({ where: { id } })).displayName;

async function lockTrade(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Trade" WHERE id = ${id} FOR UPDATE`;
  const t = await tx.trade.findUnique({ where: { id } });
  if (!t || t.status !== 'PENDING') throw new MarketError('closed');
  return t;
}

const release = (tx: Tx, t: { id: string; offerIds: string[] }) =>
  tx.cardInstance.updateMany({
    where: { id: { in: t.offerIds }, lock: `trade:${t.id}` },
    data: { lock: null },
  });

/** Seconde confirmation : le destinataire accepte, tout s'échange dans la même transaction. */
export async function acceptTrade(db: PrismaClient, userId: string, tradeId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const t = await lockTrade(tx, tradeId);
    if (t.toId !== userId) throw new MarketError('not-yours', 403);
    if (t.expiresAt <= now) throw new MarketError('closed');
    await lockUsers(tx, [t.fromId, t.toId]);
    assertCanSell(await tx.user.findUniqueOrThrow({ where: { id: userId } }), now);
    const offered = await tx.cardInstance.count({
      where: { id: { in: t.offerIds }, ownerId: t.fromId, lock: `trade:${t.id}` },
    });
    const asked = await tx.cardInstance.updateMany({
      where: { id: { in: t.askIds }, ownerId: t.toId, lock: null, card: { status: 'ACTIVE' } },
      data: { ownerId: t.fromId, acquiredAt: now },
    });
    if (offered !== t.offerIds.length || asked.count !== t.askIds.length) throw new MarketError('changed');
    await tx.cardInstance.updateMany({
      where: { id: { in: t.offerIds } },
      data: { ownerId: t.toId, lock: null, acquiredAt: now },
    });
    await notify(tx, t.fromId, 'TRADE_ACCEPTED', { tradeId: t.id, from: await nameOf(tx, t.toId) });
    return tx.trade.update({ where: { id: t.id }, data: { status: 'DONE', closedAt: now } });
  });
}

export async function closeTrade(
  db: PrismaClient,
  userId: string,
  tradeId: string,
  how: 'DECLINED' | 'CANCELLED',
) {
  return db.$transaction(async (tx) => {
    const t = await lockTrade(tx, tradeId);
    if ((how === 'DECLINED' ? t.toId : t.fromId) !== userId) throw new MarketError('not-yours', 403);
    await release(tx, t);
    // refus : l'auteur est prévenu ; retrait : le destinataire
    const [to, by] = how === 'DECLINED' ? [t.fromId, t.toId] : [t.toId, t.fromId];
    await notify(tx, to, how === 'DECLINED' ? 'TRADE_DECLINED' : 'TRADE_CANCELLED', {
      tradeId: t.id,
      from: await nameOf(tx, by),
    });
    return tx.trade.update({ where: { id: t.id }, data: { status: how, closedAt: new Date() } });
  });
}

/** Ménage périodique (et à chaque lecture) : enchères échues réglées, échanges expirés rendus. */
export async function sweep(db: PrismaClient, now = new Date()) {
  const due = await db.auction.findMany({
    where: { status: 'OPEN', endsAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of due) await db.$transaction((tx) => settle(tx, id, now));
  const stale = await db.trade.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of stale)
    await db.$transaction(async (tx) => {
      const t = await lockTrade(tx, id).catch(() => null);
      if (!t) return;
      await release(tx, t);
      await tx.trade.update({ where: { id }, data: { status: 'EXPIRED', closedAt: now } });
      await notify(tx, t.fromId, 'TRADE_EXPIRED', { tradeId: id, from: await nameOf(tx, t.toId) });
    });
  return { settled: due.length, expired: stale.length };
}
