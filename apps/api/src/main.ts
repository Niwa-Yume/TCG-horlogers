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
  ],
  providers: [PrismaService, SessionService],
})
class AppModule {}

setupPassport();
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix('api');
app.use(passport.initialize());
app.set('trust proxy', 1); // derrière Caddy
app.enableShutdownHooks();
new DuelServer(app.get(PrismaService)).attach(app.getHttpServer());
await app.listen(Number(process.env.PORT ?? 3000));
