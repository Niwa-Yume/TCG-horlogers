// Le joueur : état des boosters, ouverture, collection, recyclage des doublons, récompense du jour.
import { randomInt } from 'node:crypto';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Prisma, User } from '@prisma/client';
import {
  BOOSTER_MAX,
  boosterState,
  centuryOf,
  DAILY_RUBIS,
  FIRST_BOOSTER_GUARANTEE,
  RECYCLE_RUBIS,
  rarityRank,
  type CollectionView,
  type MeView,
  type PullView,
} from '@wm/shared';
import { configuredProviders } from './auth.controller';
import { drawBooster } from './booster';
import { langOf, toView } from './card-view';
import { PrismaService } from './prisma';
import { SessionService } from './session';

const day = (d: Date) => d.toISOString().slice(0, 10);
const lock = (tx: Prisma.TransactionClient, id: string) =>
  tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${id} FOR UPDATE`;

export function toMe(u: User | null, now = new Date()): MeView {
  if (!u)
    return {
      exists: false,
      isGuest: true,
      displayName: null,
      rubis: 0,
      stock: 3,
      nextAt: null,
      boostersOpened: 0,
      dailyAvailable: false,
      providers: configuredProviders(),
    };
  const st = boosterState(u.boosterStock, u.boosterRefill, now);
  return {
    exists: true,
    isGuest: u.isGuest,
    displayName: u.displayName,
    rubis: u.rubis,
    stock: st.stock,
    nextAt: st.nextAt?.toISOString() ?? null,
    boostersOpened: u.boostersOpened,
    dailyAvailable: !u.lastDaily || day(u.lastDaily) !== day(now),
    providers: configuredProviders(),
  };
}

@Controller()
export class PlayerController {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(SessionService) private session: SessionService,
  ) {}

  private catalogue() {
    return this.db.card.count({ where: { status: 'ACTIVE' } });
  }

  @Get('me')
  async me(@Req() req: Request) {
    return toMe(await this.session.user(req));
  }

  @Post('boosters/open')
  async open(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('lang') lang?: string,
  ): Promise<PullView> {
    const guest = await this.session.ensure(req, res);
    const now = new Date();
    const { user, drawn, owned } = await this.db.$transaction(async (tx) => {
      await lock(tx, guest.id);
      const u = await tx.user.findUniqueOrThrow({ where: { id: guest.id } });
      const st = boosterState(u.boosterStock, u.boosterRefill, now);
      if (st.stock < 1)
        throw new ConflictException({ message: 'Plus de booster en stock', nextAt: st.nextAt });
      const pool = await tx.card.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, rarity: true },
      });
      const drawn = drawBooster(
        pool,
        randomInt,
        u.boostersOpened === 0 ? FIRST_BOOSTER_GUARANTEE : undefined,
      );
      const before = await tx.cardInstance.findMany({
        where: { ownerId: u.id, cardId: { in: drawn.map((c) => c.id) } },
        select: { cardId: true },
      });
      const created = await tx.cardInstance.createManyAndReturn({
        data: drawn.map((c) => ({ cardId: c.id, ownerId: u.id })),
        select: { id: true, cardId: true },
      });
      const user = await tx.user.update({
        where: { id: u.id },
        data: {
          boosterStock: st.stock - 1,
          boosterRefill: st.stock === BOOSTER_MAX ? now : st.refill,
          boostersOpened: { increment: 1 },
        },
      });
      return {
        user,
        drawn: drawn.map((c) => created.find((i) => i.cardId === c.id)!),
        owned: new Set(before.map((b) => b.cardId)),
      };
    });
    const cards = await this.db.card.findMany({ where: { id: { in: drawn.map((d) => d.cardId) } } });
    const total = await this.catalogue();
    return {
      cards: drawn.map((d) => ({
        ...toView(
          cards.find((c) => c.id === d.cardId)!,
          langOf(lang),
          total,
        ),
        instanceId: d.id,
        duplicate: owned.has(d.cardId),
      })),
      me: toMe(user, now),
    };
  }

  @Get('collection')
  async collection(@Req() req: Request, @Query('lang') lang?: string): Promise<CollectionView> {
    const user = await this.session.user(req);
    const [active, instances] = await Promise.all([
      this.db.card.findMany({ where: { status: 'ACTIVE' }, select: { type: true, year: true } }),
      user
        ? this.db.cardInstance.findMany({
            where: { ownerId: user.id, card: { status: 'ACTIVE' } },
            include: { card: true },
            orderBy: { acquiredAt: 'desc' },
          })
        : [],
    ]);
    const byType: CollectionView['byType'] = {};
    const byCentury: Record<string, number> = {};
    for (const c of active) {
      byType[c.type] = (byType[c.type] ?? 0) + 1;
      byCentury[centuryOf(c.year)] = (byCentury[centuryOf(c.year)] ?? 0) + 1;
    }
    const groups = new Map<string, CollectionView['owned'][number]>();
    for (const i of instances) {
      const g = groups.get(i.cardId);
      if (g) g.count++;
      else
        groups.set(i.cardId, {
          card: toView(i.card, langOf(lang), active.length),
          count: 1,
          instanceId: i.id,
        });
    }
    const owned = [...groups.values()].sort(
      (a, b) => rarityRank(b.card.rarity) - rarityRank(a.card.rarity) || a.card.number - b.card.number,
    );
    return { owned, byType, byCentury, catalogue: active.length };
  }

  /** Recycle les doublons (d'une carte, ou de toutes) : on garde l'exemplaire le plus ancien. */
  @Post('collection/recycle')
  async recycle(@Req() req: Request, @Body() body: { slug?: unknown }) {
    const user = await this.session.user(req);
    if (!user) throw new UnauthorizedException();
    const slug = typeof body?.slug === 'string' ? body.slug : undefined;
    return this.db.$transaction(async (tx) => {
      await lock(tx, user.id);
      const instances = await tx.cardInstance.findMany({
        where: { ownerId: user.id, ...(slug && { card: { slug } }) },
        select: { id: true, cardId: true, card: { select: { rarity: true } } },
        orderBy: { acquiredAt: 'asc' },
      });
      const seen = new Set<string>();
      const extra = instances.filter((i) => seen.has(i.cardId) || !seen.add(i.cardId));
      const gained = extra.reduce((a, i) => a + RECYCLE_RUBIS[i.card.rarity], 0);
      if (!gained) return { gained: 0, recycled: 0, me: toMe(user) };
      await tx.cardInstance.deleteMany({ where: { id: { in: extra.map((i) => i.id) } } });
      await tx.ledgerEntry.create({ data: { userId: user.id, delta: gained, reason: 'RECYCLE' } });
      const u = await tx.user.update({ where: { id: user.id }, data: { rubis: { increment: gained } } });
      return { gained, recycled: extra.length, me: toMe(u) };
    });
  }

  @Post('daily')
  async daily(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.session.ensure(req, res);
    return this.db.$transaction(async (tx) => {
      await lock(tx, user.id);
      const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const now = new Date();
      if (u.lastDaily && day(u.lastDaily) === day(now))
        throw new ConflictException('Récompense déjà prise aujourd’hui');
      await tx.ledgerEntry.create({ data: { userId: u.id, delta: DAILY_RUBIS, reason: 'DAILY' } });
      return {
        gained: DAILY_RUBIS,
        me: toMe(
          await tx.user.update({
            where: { id: u.id },
            data: { rubis: { increment: DAILY_RUBIS }, lastDaily: now },
          }),
          now,
        ),
      };
    });
  }
}
