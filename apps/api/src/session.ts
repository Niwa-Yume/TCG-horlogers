// Session : JWT signé (HS256) dans un cookie httpOnly. Une session invitée naît au premier booster.
import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '@prisma/client';
import { PrismaService } from './prisma';

export const COOKIE = 'wm_session';
const YEAR = 365 * 24 * 3600;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET manquant (32 caractères au moins)');
  return new TextEncoder().encode(s);
};
export const publicUrl = () => (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const secure = () => publicUrl().startsWith('https://');

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookie(res: Response, name: string, value: string, maxAgeSec: number, path = '/') {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    maxAge: maxAgeSec * 1000,
    path,
  });
}

@Injectable()
export class SessionService {
  constructor(@Inject(PrismaService) private db: PrismaService) {}

  async userId(req: Request): Promise<string | null> {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async user(req: Request): Promise<User | null> {
    const id = await this.userId(req);
    return id ? this.db.user.findUnique({ where: { id } }) : null;
  }

  async signIn(res: Response, userId: string) {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${YEAR}s`)
      .sign(secret());
    setCookie(res, COOKIE, token, YEAR);
  }

  /** L'utilisateur courant, ou un invité créé pour l'occasion. */
  async ensure(req: Request, res: Response): Promise<User> {
    const existing = await this.user(req);
    if (existing) return existing;
    const guest = await this.db.user.create({ data: { displayName: `horloger-${randomInt(1000, 10000)}` } });
    await this.signIn(res, guest.id);
    return guest;
  }

  signOut(res: Response) {
    res.clearCookie(COOKIE, { path: '/' });
  }
}
