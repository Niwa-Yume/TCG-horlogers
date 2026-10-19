// Page admin : relecture des QCM, interrupteur d'urgence et overrides des cartes. Protégée par ADMIN_TOKEN.
import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { QuestionView } from '@wm/shared';
import { checkPlate, plates } from './card-view';
import { PrismaService } from './prisma';

@Injectable()
class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const expected = Buffer.from(`Bearer ${process.env.ADMIN_TOKEN ?? ''}`);
    const got = Buffer.from(String(ctx.switchToHttp().getRequest().headers.authorization ?? ''));
    if (!process.env.ADMIN_TOKEN || got.length !== expected.length || !timingSafeEqual(got, expected))
      throw new UnauthorizedException();
    return true;
  }
}

const bad = (m: string) => new BadRequestException(m);
const text = (v: unknown, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** { fr, en } : chaque langue optionnelle, ou null pour effacer. */
function localized(v: unknown, field: string) {
  if (v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw bad(`${field} : objet { fr, en } attendu`);
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const l of ['fr', 'en']) {
    if (o[l] == null || o[l] === '') continue;
    if (!text(o[l])) throw bad(`${field}.${l} invalide`);
    out[l] = (o[l] as string).trim();
  }
  return Object.keys(out).length ? out : null;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(PrismaService) private db: PrismaService) {}

  @Get('questions')
  async questions(@Query('verified') verified?: string, @Query('offset') offset?: string) {
    const where = { verified: verified === 'true' };
    const [total, pending, rows] = await Promise.all([
      this.db.question.count({ where }),
      this.db.question.count({ where: { verified: false } }),
      this.db.question.findMany({
        where,
        include: { card: { select: { slug: true, nameFr: true } } },
        orderBy: [{ card: { number: 'asc' } }, { id: 'asc' }],
        skip: Math.max(0, Number(offset) || 0),
        take: 50,
      }),
    ]);
    const items: QuestionView[] = rows.map(({ card, cardId: _, ...q }) => ({
      ...q,
      card: { slug: card.slug, name: card.nameFr },
    }));
    return { total, pending, items };
  }

  @Patch('questions/:id')
  async updateQuestion(@Param('id') id: string, @Body() b: Record<string, unknown>) {
    const data: Prisma.QuestionUpdateInput = {};
    for (const k of ['promptFr', 'promptEn'] as const)
      if (k in b) {
        if (!text(b[k], 300)) throw bad(`${k} invalide`);
        data[k] = (b[k] as string).trim();
      }
    for (const k of ['choicesFr', 'choicesEn'] as const)
      if (k in b) {
        const c = b[k];
        if (!Array.isArray(c) || c.length !== 4 || !c.every((x) => text(x, 120)) || new Set(c).size !== 4)
          throw bad(`${k} : quatre choix distincts attendus`);
        data[k] = (c as string[]).map((x) => x.trim());
      }
    if ('answerIndex' in b) {
      if (![0, 1, 2, 3].includes(b.answerIndex as number)) throw bad('answerIndex : 0 à 3');
      data.answerIndex = b.answerIndex as number;
    }
    if ('verified' in b) {
      if (typeof b.verified !== 'boolean') throw bad('verified : booléen');
      data.verified = b.verified;
    }
    if (data.promptFr || data.choicesFr) data.source = 'MANUAL';
    return this.db.question.update({ where: { id }, data });
  }

  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    await this.db.question.delete({ where: { id } });
    return { ok: true };
  }

  @Get('plates')
  plates() {
    return plates;
  }

  @Get('cards')
  async cards(@Query('q') q?: string, @Query('offset') offset?: string) {
    const s = q?.trim().slice(0, 80);
    const where: Prisma.CardWhereInput = s
      ? {
          OR: [
            { nameFr: { contains: s, mode: 'insensitive' } },
            { nameEn: { contains: s, mode: 'insensitive' } },
            { slug: { contains: s } },
          ],
        }
      : {};
    const [total, items] = await Promise.all([
      this.db.card.count({ where }),
      this.db.card.findMany({
        where,
        orderBy: { number: 'asc' },
        skip: Math.max(0, Number(offset) || 0),
        take: 50,
        select: {
          id: true,
          slug: true,
          number: true,
          type: true,
          rarity: true,
          status: true,
          nameFr: true,
          nameEn: true,
          overrideName: true,
          overrideText: true,
          overrideImage: true,
          plate: true,
          dialYear: true,
          isFlagship: true,
        },
      }),
    ]);
    return { total, items };
  }

  @Patch('cards/:id')
  async updateCard(@Param('id') id: string, @Body() b: Record<string, unknown>) {
    const card = await this.db.card.findUniqueOrThrow({ where: { id } });
    const data: Prisma.CardUpdateInput = {};
    if ('status' in b) {
      if (b.status !== 'ACTIVE' && b.status !== 'RETIRED') throw bad('status : ACTIVE ou RETIRED');
      data.status = b.status;
    }
    for (const k of ['overrideName', 'overrideText'] as const)
      if (k in b) data[k] = localized(b[k], k) ?? (null as unknown as Prisma.InputJsonValue);
    if ('overrideImage' in b) {
      // seulement un cadran peint du dépôt : jamais une image externe
      if (
        b.overrideImage !== null &&
        !(typeof b.overrideImage === 'string' && /^\/dials\/[a-z0-9-]+$/.test(b.overrideImage))
      )
        throw bad('overrideImage : /dials/<nom> ou null');
      data.overrideImage = b.overrideImage as string | null;
    }
    if ('plate' in b) {
      if (b.plate !== null && typeof b.plate !== 'string') throw bad('plate invalide');
      data.plate = b.plate as string | null;
    }
    if ('dialYear' in b) {
      if (b.dialYear !== null && !Number.isInteger(b.dialYear)) throw bad('dialYear : entier');
      data.dialYear = b.dialYear as number | null;
    }
    const plateError = checkPlate(
      ('plate' in b ? b.plate : card.plate) as string | null,
      ('dialYear' in b ? b.dialYear : card.dialYear) as number | null,
    );
    if (plateError) throw bad(plateError);
    return this.db.card.update({ where: { id }, data });
  }
}
