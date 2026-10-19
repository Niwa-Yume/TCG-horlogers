// Limite d'actions par minute : fenêtre glissante en mémoire, par session et par adresse IP.
// ponytail: en mémoire d'un seul processus ; Redis si l'API passe à plusieurs instances.
import type { NextFunction, Request, Response } from 'express';
import { ACTIONS_PER_MINUTE } from '@wm/shared';
import { COOKIE, readCookie } from '../session';

export class Window {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private ms = 60_000,
  ) {}

  /** true si l'action passe ; false si la limite est atteinte. */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.ms);
    const ok = recent.length < this.limit;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000)
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.ms)) this.hits.delete(k);
    return ok;
  }
}

const perSession = new Window(ACTIONS_PER_MINUTE);
const perIp = new Window(ACTIONS_PER_MINUTE * 4); // plusieurs joueurs derrière une même box

/** Toutes les écritures de l'API publique (l'admin a son jeton et n'est pas limitée). */
export function actionLimit(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path.startsWith('/api/admin')) return next();
  const session = readCookie(req, COOKIE);
  const ok = perIp.hit(`ip:${req.ip}`) && (!session || perSession.hit(`s:${session.slice(-32)}`));
  if (ok) return next();
  res.status(429).set('Retry-After', '60').json({ statusCode: 429, message: 'too-many-actions' });
}
