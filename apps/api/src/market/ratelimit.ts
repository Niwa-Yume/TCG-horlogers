// Limite d'actions par minute, partagée par tous les processus API : un compteur par clé et par minute dans
// Postgres (fenêtre fixe), incrémenté et lu en une seule requête. Clés : la session (hachée) et l'adresse IP.
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ACTIONS_PER_MINUTE } from '@wm/shared';
import { COOKIE, readCookie } from '../session';

const LIMITS = { s: ACTIONS_PER_MINUTE, ip: ACTIONS_PER_MINUTE * 4 }; // plusieurs joueurs derrière une même box

/** Compte une action pour chaque clé ; rend true si l'une d'elles dépasse sa limite. */
export async function overLimit(db: PrismaClient, keys: string[], now = Date.now()): Promise<boolean> {
  const window = new Date(Math.floor(now / 60_000) * 60_000);
  const rows = await db.$queryRaw<{ key: string; count: number }[]>`
    INSERT INTO "ActionCount" (key, "window", count)
    VALUES ${Prisma.join(keys.map((k) => Prisma.sql`(${k}, ${window}, 1)`))}
    ON CONFLICT (key, "window") DO UPDATE SET count = "ActionCount".count + 1
    RETURNING key, count`;
  return rows.some((r) => r.count > LIMITS[r.key.split(':')[0] as keyof typeof LIMITS]);
}

/** Toutes les écritures de l'API publique (l'admin a son jeton et n'est pas limitée). */
export function actionLimit(db: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.path.startsWith('/api/admin')) return next();
    const session = readCookie(req, COOKIE);
    // on ne garde jamais le jeton de session en clair : une empreinte suffit
    const keys = [
      `ip:${req.ip}`,
      ...(session ? [`s:${createHash('sha256').update(session).digest('hex').slice(0, 32)}`] : []),
    ];
    try {
      if (await overLimit(db, keys))
        return void res
          .status(429)
          .set('Retry-After', '60')
          .json({ statusCode: 429, message: 'too-many-actions' });
    } catch (e) {
      console.error('limite d’actions indisponible', e); // base injoignable : l'action échouera de toute façon
    }
    next();
  };
}

/** Ménage : les compteurs des minutes passées ne servent plus. */
export const purgeCounts = (db: PrismaClient, now = Date.now()) =>
  db.actionCount.deleteMany({ where: { window: { lt: new Date(now - 2 * 60_000) } } });
