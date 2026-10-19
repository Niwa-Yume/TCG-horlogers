-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('WATCHMAKER', 'MAISON', 'MODEL', 'INVENTION', 'COMPLICATION', 'EVENT');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('GRAVURE', 'MARQUETERIE', 'GRISAILLE', 'CLOISONNE', 'GRAND_FEU');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "CardType" NOT NULL,
    "wikidataId" TEXT,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "captionFr" TEXT,
    "captionEn" TEXT,
    "summaryFr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "anecdoteFr" TEXT,
    "anecdoteEn" TEXT,
    "author" TEXT,
    "year" INTEGER,
    "yearEnd" INTEGER,
    "yearCirca" BOOLEAN NOT NULL DEFAULT false,
    "plate" TEXT,
    "plateSeed" INTEGER,
    "dialYear" INTEGER,
    "dialPlaceFr" TEXT,
    "dialPlaceEn" TEXT,
    "dialImage" TEXT,
    "shareImage" TEXT,
    "rarity" "Rarity" NOT NULL,
    "precision" INTEGER NOT NULL,
    "complication" INTEGER NOT NULL,
    "innovation" INTEGER NOT NULL,
    "prestige" INTEGER NOT NULL,
    "heritage" INTEGER NOT NULL,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "isFlagship" BOOLEAN NOT NULL DEFAULT false,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "overrideName" JSONB,
    "overrideText" JSONB,
    "overrideImage" TEXT,
    "sourceUrlFr" TEXT,
    "sourceUrlEn" TEXT,
    "license" TEXT NOT NULL DEFAULT 'CC BY-SA 4.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "provider" TEXT,
    "providerId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "rubis" INTEGER NOT NULL DEFAULT 0,
    "boosterStock" INTEGER NOT NULL DEFAULT 3,
    "boosterRefill" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "tutorialDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstance" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardIds" TEXT[],

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "promptFr" TEXT NOT NULL,
    "promptEn" TEXT NOT NULL,
    "choicesFr" TEXT[],
    "choicesEn" TEXT[],
    "answerIndex" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "playerA" TEXT NOT NULL,
    "playerB" TEXT,
    "winnerId" TEXT,
    "seed" TEXT NOT NULL,
    "log" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_slug_key" ON "Card"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Card_number_key" ON "Card"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Card_wikidataId_key" ON "Card"("wikidataId");

-- CreateIndex
CREATE INDEX "Card_status_type_rarity_idx" ON "Card"("status", "type", "rarity");

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_providerId_key" ON "User"("provider", "providerId");

-- CreateIndex
CREATE INDEX "CardInstance_ownerId_cardId_idx" ON "CardInstance"("ownerId", "cardId");

-- CreateIndex
CREATE INDEX "Question_verified_idx" ON "Question"("verified");

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
