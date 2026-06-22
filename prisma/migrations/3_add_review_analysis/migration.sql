-- CreateTable
CREATE TABLE "ReviewAnalysis" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reviewText" TEXT NOT NULL,
    "englishSentiment" TEXT,
    "englishLabel" INTEGER,
    "englishConfidence" DOUBLE PRECISION,
    "romanSentiment" TEXT,
    "romanConfidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'playground',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAnalysis_shop_idx" ON "ReviewAnalysis"("shop");

-- CreateIndex
CREATE INDEX "ReviewAnalysis_createdAt_idx" ON "ReviewAnalysis"("createdAt");
