-- CreateTable
CREATE TABLE "SourceConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSourceItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "author" TEXT,
    "rawPayload" JSONB,
    "city" TEXT,
    "area" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "tags" TEXT[],
    "source" TEXT,
    "sourceUrl" TEXT,
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "tags" TEXT[],
    "priceLevel" INTEGER,
    "quietness" INTEGER,
    "popularity" INTEGER,
    "source" TEXT,
    "sourceUrl" TEXT,
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitySignal" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "tag" TEXT NOT NULL,
    "heatScore" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "CitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficSnapshot" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "mode" TEXT NOT NULL,
    "distance" INTEGER,
    "duration" INTEGER,
    "congestion" TEXT,
    "rawPayload" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interests" TEXT[],
    "mood" TEXT,
    "budget" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "input" JSONB NOT NULL,
    "recommendedRoutes" JSONB NOT NULL,
    "feedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawSourceItem_source_idx" ON "RawSourceItem"("source");

-- CreateIndex
CREATE INDEX "RawSourceItem_city_idx" ON "RawSourceItem"("city");

-- CreateIndex
CREATE INDEX "Event_city_idx" ON "Event"("city");

-- CreateIndex
CREATE INDEX "Event_area_idx" ON "Event"("area");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Venue_city_idx" ON "Venue"("city");

-- CreateIndex
CREATE INDEX "Venue_area_idx" ON "Venue"("area");

-- CreateIndex
CREATE INDEX "CitySignal_city_idx" ON "CitySignal"("city");

-- CreateIndex
CREATE INDEX "CitySignal_area_idx" ON "CitySignal"("area");

-- CreateIndex
CREATE INDEX "CitySignal_tag_idx" ON "CitySignal"("tag");

-- CreateIndex
CREATE INDEX "CitySignal_capturedAt_idx" ON "CitySignal"("capturedAt");

-- CreateIndex
CREATE INDEX "TrafficSnapshot_city_idx" ON "TrafficSnapshot"("city");

-- CreateIndex
CREATE INDEX "TrafficSnapshot_capturedAt_idx" ON "TrafficSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "RecommendationLog_userId_idx" ON "RecommendationLog"("userId");

-- CreateIndex
CREATE INDEX "RecommendationLog_createdAt_idx" ON "RecommendationLog"("createdAt");
