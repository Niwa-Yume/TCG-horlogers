// Upsert de packages/ingest/data/cards.generated.json. Ne touche jamais aux champs d'admin
// (status, override*) ni aux questions déjà relues.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';

const FILE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'ingest',
  'data',
  'cards.generated.json',
);
const DIALS = join(import.meta.dirname, '..', '..', '..', 'assets');
const db = new PrismaClient();
type Generated = Record<string, unknown> & {
  slug: string;
  stats: Record<string, number>;
  facts: unknown;
  questions: (Omit<Prisma.QuestionCreateInput, 'card'> & { id: string })[];
};
const { cards } = JSON.parse(await readFile(FILE, 'utf8')) as { cards: Generated[] };

let questions = 0;
let missing = 0;
await db.$transaction(
  async (tx) => {
    // libère les numéros pour éviter les collisions transitoires sur la contrainte unique
    await tx.card.updateMany({ data: { number: { multiply: -1 } } });
    for (const { stats, facts: _f, questions: qs, ...c } of cards) {
      // un cadran pas encore peint : émail uni plutôt qu'une image cassée
      if (typeof c.dialImage === 'string' && !existsSync(join(DIALS, `${c.dialImage}.webp`))) {
        c.dialImage = null;
        missing++;
      }
      const data = { ...c, ...stats } as Prisma.CardCreateInput;
      const card = await tx.card.upsert({ where: { slug: c.slug }, create: data, update: data });
      for (const q of qs) {
        const existing = await tx.question.findUnique({ where: { id: q.id } });
        if (existing && (existing.verified || existing.source === 'MANUAL')) continue;
        await tx.question.upsert({ where: { id: q.id }, create: { ...q, cardId: card.id }, update: q });
        questions++;
      }
    }
    // cartes absentes du fichier (retirées de Wikidata) : on rend leur numéro, jamais réattribué par l'ingestion
    await tx.$executeRaw`UPDATE "Card" SET number = -number WHERE number < 0`;
  },
  { timeout: 120_000 },
);
console.log(`${cards.length} cartes, ${questions} questions à jour, ${missing} cadran(s) pas encore peint(s)`);
await db.$disconnect();
