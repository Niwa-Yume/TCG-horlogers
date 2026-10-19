import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AdminController } from './admin.controller';
import { CardsController } from './cards.controller';
import { PrismaService } from './prisma';

@Module({ controllers: [CardsController, AdminController], providers: [PrismaService] })
class AppModule {}

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000));
