import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { langOf, toView } from '../card-view';
import { PrismaService } from '../prisma';
import { SessionService } from '../session';
import { deckOf, MIN_CARDS } from './server';

@Controller('duel')
export class DuelController {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(SessionService) private session: SessionService,
  ) {}

  /** Le deck automatique du joueur et s'il peut jouer. */
  @Get('deck')
  async deck(@Req() req: Request, @Query('lang') lang?: string) {
    const user = await this.session.user(req);
    const cards = user ? await deckOf(this.db, user.id) : [];
    const total = await this.db.card.count({ where: { status: 'ACTIVE' } });
    return {
      cards: cards.map((c) => toView(c, langOf(lang), total)),
      min: MIN_CARDS,
      rating: user?.rating ?? 1000,
    };
  }

  @Get('leaderboard')
  async leaderboard() {
    const top = await this.db.user.findMany({
      where: { isGuest: false },
      orderBy: { rating: 'desc' },
      take: 20,
      select: { displayName: true, rating: true },
    });
    return top.map((u) => ({ name: u.displayName, rating: u.rating }));
  }
}
