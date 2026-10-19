import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { CARD_TYPES, RARITIES, type CardList } from '@wm/shared';
import type { Prisma } from '@prisma/client';
import { langOf, toDetail, toView } from './card-view';
import { PrismaService } from './prisma';

const pick = <T extends string>(list: readonly T[], v: unknown) =>
  list.includes(v as T) ? (v as T) : undefined;
const int = (v: unknown, def: number, max: number) =>
  Math.min(max, Math.max(0, Number.parseInt(String(v ?? def), 10) || 0));

@Controller('cards')
export class CardsController {
  constructor(@Inject(PrismaService) private db: PrismaService) {}

  @Get()
  async list(@Query() q: Record<string, string | undefined>): Promise<CardList> {
    const lang = langOf(q.lang);
    const search = q.q?.trim().slice(0, 80);
    const where: Prisma.CardWhereInput = {
      status: 'ACTIVE',
      type: pick(CARD_TYPES, q.type),
      rarity: pick(RARITIES, q.rarity),
      ...(search && {
        OR: [
          { nameFr: { contains: search, mode: 'insensitive' } },
          { nameEn: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [catalogue, total, rows] = await Promise.all([
      this.db.card.count({ where: { status: 'ACTIVE' } }),
      this.db.card.count({ where }),
      this.db.card.findMany({
        where,
        orderBy: [{ isFlagship: 'desc' }, { rarity: 'desc' }, { number: 'asc' }],
        skip: int(q.offset, 0, 100_000),
        take: int(q.limit, 48, 100) || 48,
      }),
    ]);
    return { total, items: rows.map((c) => toView(c, lang, catalogue)) };
  }

  @Get(':slug')
  async one(@Param('slug') slug: string, @Query('lang') lang?: string) {
    const card = await this.db.card.findFirst({ where: { slug, status: 'ACTIVE' } });
    if (!card) throw new NotFoundException();
    return toDetail(card, langOf(lang), await this.db.card.count({ where: { status: 'ACTIVE' } }));
  }
}
