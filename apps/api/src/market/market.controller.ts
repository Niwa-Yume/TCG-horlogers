// Marché : enchères, échanges, recherche de joueurs. Toute écriture exige une session (et un compte pour vendre).
import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Card, CardInstance } from '@prisma/client';
import { nextMinBid, RARITIES, type AuctionView, type Lang, type TradeView } from '@wm/shared';
import { langOf, toView } from '../card-view';
import { PrismaService } from '../prisma';
import { SessionService } from '../session';
import {
  acceptTrade,
  cancelAuction,
  closeTrade,
  createAuction,
  MarketError,
  placeBid,
  proposeTrade,
  sweep,
} from './market';

/** Les erreurs métier deviennent des réponses HTTP avec un code lisible par le client. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MarketError)
      throw new HttpException({ statusCode: e.status, message: e.code, ...e.detail }, e.status);
    throw e;
  }
}

@Controller('market')
export class MarketController {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(SessionService) private session: SessionService,
  ) {}

  private async userId(req: Request) {
    const id = await this.session.userId(req);
    if (!id) throw new UnauthorizedException();
    return id;
  }
  private total() {
    return this.db.card.count({ where: { status: 'ACTIVE' } });
  }
  private card(c: Card, lang: Lang, total: number) {
    return toView(c, lang, total);
  }

  // ---------- Enchères ----------

  @Get('auctions')
  async auctions(
    @Req() req: Request,
    @Query('view') view = 'open',
    @Query('rarity') rarity?: string,
    @Query('lang') l?: string,
  ): Promise<AuctionView[]> {
    await sweep(this.db);
    const me = await this.session.userId(req);
    const lang = langOf(l);
    const where =
      view === 'mine' && me
        ? { sellerId: me }
        : view === 'bids' && me
          ? { bids: { some: { bidderId: me } } }
          : {
              status: 'OPEN' as const,
              instance: {
                card: {
                  status: 'ACTIVE' as const,
                  ...(RARITIES.includes(rarity as never) && { rarity: rarity as never }),
                },
              },
            };
    const rows = await this.db.auction.findMany({
      where,
      include: {
        instance: { include: { card: true } },
        seller: { select: { displayName: true } },
        _count: { select: { bids: true } },
      },
      orderBy: view === 'open' ? { endsAt: 'asc' } : { createdAt: 'desc' },
      take: 60,
    });
    const total = await this.total();
    return rows.map((a) => ({
      id: a.id,
      card: this.card(a.instance.card, lang, total),
      seller: a.seller.displayName,
      mine: a.sellerId === me,
      startPrice: a.startPrice,
      bestBid: a.bestBid,
      leading: !!me && a.bestBidder === me,
      bids: a._count.bids,
      minBid: nextMinBid(a.startPrice, a.bestBid),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
    }));
  }

  @Post('auctions')
  async sell(@Req() req: Request, @Body() b: { instanceId?: unknown; startPrice?: unknown }) {
    const id = await this.userId(req);
    return run(() => createAuction(this.db, id, String(b?.instanceId), Number(b?.startPrice)));
  }

  @Post('auctions/:id/bid')
  async bid(@Req() req: Request, @Param('id') auctionId: string, @Body() b: { amount?: unknown }) {
    const id = await this.userId(req);
    await sweep(this.db);
    return run(() => placeBid(this.db, id, auctionId, Number(b?.amount)));
  }

  @Post('auctions/:id/cancel')
  async cancel(@Req() req: Request, @Param('id') auctionId: string) {
    const id = await this.userId(req);
    return run(() => cancelAuction(this.db, id, auctionId));
  }

  // ---------- Exemplaires disponibles (vente et échange) ----------

  private async freeCards(ownerId: string, lang: Lang) {
    const total = await this.total();
    const rows: (CardInstance & { card: Card })[] = await this.db.cardInstance.findMany({
      where: { ownerId, lock: null, card: { status: 'ACTIVE' } },
      include: { card: true },
      orderBy: [{ card: { rarity: 'desc' } }, { card: { number: 'asc' } }],
    });
    return rows.map((r) => ({ ...this.card(r.card, lang, total), instanceId: r.id }));
  }

  @Get('mine')
  async mine(@Req() req: Request, @Query('lang') l?: string) {
    return this.freeCards(await this.userId(req), langOf(l));
  }

  @Get('players')
  async players(@Req() req: Request, @Query('q') q = '') {
    const me = await this.session.userId(req);
    const s = q.trim().slice(0, 32);
    if (s.length < 2) return [];
    const rows = await this.db.user.findMany({
      where: {
        isGuest: false,
        displayName: { contains: s, mode: 'insensitive' },
        ...(me && { id: { not: me } }),
      },
      select: { id: true, displayName: true, rating: true },
      take: 10,
    });
    return rows.map((u) => ({ id: u.id, name: u.displayName, rating: u.rating }));
  }

  @Get('players/:id/cards')
  async playerCards(@Param('id') id: string, @Query('lang') l?: string) {
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u || u.isGuest) throw new HttpException({ statusCode: 404, message: 'no-player' }, 404);
    return { name: u.displayName, cards: await this.freeCards(id, langOf(l)) };
  }

  // ---------- Échanges ----------

  @Get('trades')
  async trades(@Req() req: Request, @Query('lang') l?: string): Promise<TradeView[]> {
    const me = await this.userId(req);
    await sweep(this.db);
    const lang = langOf(l);
    const rows = await this.db.trade.findMany({
      where: { OR: [{ fromId: me }, { toId: me }] },
      include: { from: { select: { displayName: true } }, to: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const ids = rows.flatMap((t) => [...t.offerIds, ...t.askIds]);
    const insts = await this.db.cardInstance.findMany({
      where: { id: { in: ids } },
      include: { card: true },
    });
    const total = await this.total();
    const view = (id: string) => {
      const i = insts.find((x) => x.id === id);
      return i ? [{ ...this.card(i.card, lang, total), instanceId: id }] : [];
    };
    return rows.map((t) => ({
      id: t.id,
      from: t.from.displayName,
      to: t.to.displayName,
      incoming: t.toId === me,
      offer: t.offerIds.flatMap(view),
      ask: t.askIds.flatMap(view),
      status: t.status,
      expiresAt: t.expiresAt.toISOString(),
    }));
  }

  @Post('trades')
  async propose(@Req() req: Request, @Body() b: { toId?: unknown; offerIds?: unknown; askIds?: unknown }) {
    const id = await this.userId(req);
    return run(() =>
      proposeTrade(this.db, id, String(b?.toId), b?.offerIds as string[], b?.askIds as string[]),
    );
  }

  @Post('trades/:id/:action')
  async decide(@Req() req: Request, @Param('id') tradeId: string, @Param('action') action: string) {
    const id = await this.userId(req);
    if (action === 'accept') return run(() => acceptTrade(this.db, id, tradeId));
    if (action === 'decline') return run(() => closeTrade(this.db, id, tradeId, 'DECLINED'));
    if (action === 'cancel') return run(() => closeTrade(this.db, id, tradeId, 'CANCELLED'));
    throw new HttpException({ statusCode: 404, message: 'unknown' }, 404);
  }
}
