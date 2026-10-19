-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'SOLD', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'DONE', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "CardInstance" ADD COLUMN     "lock" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signedUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "startPrice" INTEGER NOT NULL,
    "bestBid" INTEGER,
    "bestBidder" TEXT,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "offerIds" TEXT[],
    "askIds" TEXT[],
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Bid_auctionId_idx" ON "Bid"("auctionId");

-- CreateIndex
CREATE INDEX "Trade_toId_status_idx" ON "Trade"("toId", "status");

-- CreateIndex
CREATE INDEX "Trade_fromId_status_idx" ON "Trade"("fromId", "status");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
