import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import passport from 'passport';
import { AdminController } from './admin.controller';
import { AuthController, setupPassport } from './auth.controller';
import { CardsController } from './cards.controller';
import { DuelController } from './duel/duel.controller';
import { DuelServer } from './duel/server';
import { MarketController } from './market/market.controller';
import { sweep } from './market/market';
import { actionLimit, purgeCounts } from './market/ratelimit';
import { PlayerController } from './player.controller';
import { PrismaService } from './prisma';
import { SessionService } from './session';
import { ShareController } from './share.controller';

@Module({
  controllers: [
    CardsController,
    AdminController,
    AuthController,
    PlayerController,
    ShareController,
    DuelController,
    MarketController,
  ],
  providers: [PrismaService, SessionService],
})
class AppModule {}

setupPassport();
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api');
app.use(actionLimit(app.get(PrismaService)));
app.use(passport.initialize());
app.set('trust proxy', 1); // derrière Caddy
app.enableShutdownHooks();
new DuelServer(app.get(PrismaService)).attach(app.getHttpServer());
// enchères échues et échanges expirés : réglés toutes les 30 s (et à chaque lecture du marché)
// Chaque processus API fait ce ménage : les verrous de ligne et la vérification du statut rendent
// le règlement idempotent, deux processus ne règlent jamais deux fois la même enchère.
setInterval(() => {
  const db = app.get(PrismaService);
  void Promise.all([sweep(db), purgeCounts(db)]).catch((e) => console.error('marché : ménage impossible', e));
}, 30_000);
await app.listen(Number(process.env.PORT ?? 3000));
