// Connexion Google et Discord via Passport, sans session serveur : le compte finit dans le cookie JWT.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Inject, NotFoundException, Next, Param, Post, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { attachIdentity, type Identity } from './accounts';
import { PrismaService } from './prisma';
import { publicUrl, readCookie, SessionService, setCookie } from './session';

const STATE = 'wm_oauth_state';

/** Paramètre `state` d'OAuth gardé dans un cookie de 10 minutes (protège contre le CSRF de connexion). */
const stateStore = {
  store(req: Request, _meta: unknown, cb: (err: Error | null, state?: string) => void) {
    const state = randomBytes(16).toString('hex');
    setCookie(req.res!, STATE, state, 600, '/api/auth');
    cb(null, state);
  },
  verify(
    req: Request,
    state: string,
    _meta: unknown,
    cb: (err: Error | null, ok: boolean, info?: unknown) => void,
  ) {
    const expected = readCookie(req, STATE) ?? '';
    req.res!.clearCookie(STATE, { path: '/api/auth' });
    const ok =
      !!state &&
      expected.length === state.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(state));
    cb(null, ok, ok ? undefined : { message: 'state' });
  },
};

const name = (s: string | undefined, fallback: string) => (s?.trim() || fallback).slice(0, 32);

export function configuredProviders() {
  return (['google', 'discord'] as const).filter(
    (p) => process.env[`${p.toUpperCase()}_CLIENT_ID`] && process.env[`${p.toUpperCase()}_CLIENT_SECRET`],
  );
}

export function setupPassport() {
  const callbackURL = (p: string) => `${publicUrl()}/api/auth/${p}/callback`;
  if (configuredProviders().includes('google'))
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: callbackURL('google'),
          scope: ['profile'],
          store: stateStore as never,
        },
        (_at, _rt, profile, done) =>
          done(null, {
            provider: 'google',
            providerId: profile.id,
            name: name(profile.displayName, 'horloger'),
          } satisfies Identity),
      ),
    );
  if (configuredProviders().includes('discord'))
    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.DISCORD_CLIENT_ID!,
          clientSecret: process.env.DISCORD_CLIENT_SECRET!,
          callbackURL: callbackURL('discord'),
          scope: ['identify'],
          store: stateStore,
        },
        ((
          _at: string,
          _rt: string,
          profile: { id: string; username?: string; global_name?: string },
          done: (e: null, u: Identity) => void,
        ) =>
          done(null, {
            provider: 'discord',
            providerId: profile.id,
            name: name(profile.global_name ?? profile.username, 'horloger'),
          })) as never,
      ),
    );
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(SessionService) private session: SessionService,
  ) {}

  @Get('providers')
  providers() {
    return configuredProviders();
  }

  @Get(':provider')
  start(@Param('provider') p: string, @Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    if (!configuredProviders().includes(p as never)) throw new NotFoundException();
    passport.authenticate(p, { session: false })(req, res, next);
  }

  @Get(':provider/callback')
  callback(
    @Param('provider') p: string,
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!configuredProviders().includes(p as never)) throw new NotFoundException();
    passport.authenticate(p, { session: false }, async (err: unknown, identity: Identity | false) => {
      if (err || !identity) return res.redirect(`${publicUrl()}/collection?connexion=echec`);
      try {
        const user = await attachIdentity(this.db, await this.session.userId(req), identity);
        await this.session.signIn(res, user.id);
        res.redirect(`${publicUrl()}/collection?bienvenue=1`);
      } catch (e) {
        next(e);
      }
    })(req, res, next);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.session.signOut(res);
    return { ok: true };
  }
}
