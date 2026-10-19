-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boostersOpened" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDaily" TIMESTAMP(3);
