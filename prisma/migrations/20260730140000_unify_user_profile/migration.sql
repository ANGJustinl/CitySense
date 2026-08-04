-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "SourceConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "config" JSONB,
    "lastRunId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSourceItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "author" TEXT,
    "rawPayload" JSONB,
    "parsedPayload" JSONB,
    "city" TEXT,
    "area" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "normalizedEntityType" TEXT,
    "normalizedEntityId" TEXT,
    "ingestRunId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT,
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
    "imageUrl" TEXT,
    "imageSource" TEXT,
    "venueId" TEXT,
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT,
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
    "imageUrl" TEXT,
    "imageSource" TEXT,
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
CREATE TABLE "CitySignalPlaceMatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawSourceItemId" TEXT,
    "citySignalId" TEXT,
    "venueId" TEXT,
    "status" TEXT NOT NULL,
    "algorithmScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "llmConfidence" DOUBLE PRECISION,
    "matchedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "metadata" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitySignalPlaceMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "keywords" TEXT[],
    "sources" TEXT[],
    "status" TEXT NOT NULL,
    "requestedBy" TEXT,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
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
    "profileVersion" INTEGER,
    "signalCount" INTEGER,
    "profileResetAt" TIMESTAMP(3),
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

-- CreateTable
CREATE TABLE "UserInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "recommendationId" TEXT,
    "routeId" TEXT,
    "itemId" TEXT,
    "itemType" TEXT,
    "action" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "feedbackId" TEXT,
    "signalKey" TEXT,
    "signalKind" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateType" TEXT NOT NULL,
    "ranker" TEXT NOT NULL,
    "rankerVersion" TEXT NOT NULL,
    "recallChannels" TEXT[],
    "features" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_feedbacks" (
    "id" TEXT NOT NULL,
    "recommendation_log_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceConnector_name_key" ON "SourceConnector"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RawSourceItem_sourceKey_key" ON "RawSourceItem"("sourceKey");

-- CreateIndex
CREATE INDEX "RawSourceItem_source_idx" ON "RawSourceItem"("source");

-- CreateIndex
CREATE INDEX "RawSourceItem_city_idx" ON "RawSourceItem"("city");

-- CreateIndex
CREATE INDEX "RawSourceItem_ingestRunId_idx" ON "RawSourceItem"("ingestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceKey_key" ON "Event"("sourceKey");

-- CreateIndex
CREATE INDEX "Event_city_idx" ON "Event"("city");

-- CreateIndex
CREATE INDEX "Event_area_idx" ON "Event"("area");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Event_qualityScore_idx" ON "Event"("qualityScore");

-- CreateIndex
CREATE INDEX "Event_venueId_idx" ON "Event"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_sourceKey_key" ON "Venue"("sourceKey");

-- CreateIndex
CREATE INDEX "Venue_city_idx" ON "Venue"("city");

-- CreateIndex
CREATE INDEX "Venue_area_idx" ON "Venue"("area");

-- CreateIndex
CREATE INDEX "Venue_qualityScore_idx" ON "Venue"("qualityScore");

-- CreateIndex
CREATE INDEX "CitySignal_city_idx" ON "CitySignal"("city");

-- CreateIndex
CREATE INDEX "CitySignal_area_idx" ON "CitySignal"("area");

-- CreateIndex
CREATE INDEX "CitySignal_tag_idx" ON "CitySignal"("tag");

-- CreateIndex
CREATE INDEX "CitySignal_capturedAt_idx" ON "CitySignal"("capturedAt");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_source_idx" ON "CitySignalPlaceMatch"("source");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_status_idx" ON "CitySignalPlaceMatch"("status");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_rawSourceItemId_idx" ON "CitySignalPlaceMatch"("rawSourceItemId");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_citySignalId_idx" ON "CitySignalPlaceMatch"("citySignalId");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_venueId_idx" ON "CitySignalPlaceMatch"("venueId");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_source_status_idx" ON "CitySignalPlaceMatch"("source", "status");

-- CreateIndex
CREATE INDEX "CitySignalPlaceMatch_venueId_status_idx" ON "CitySignalPlaceMatch"("venueId", "status");

-- CreateIndex
CREATE INDEX "IngestRun_status_idx" ON "IngestRun"("status");

-- CreateIndex
CREATE INDEX "IngestRun_createdAt_idx" ON "IngestRun"("createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "UserInteraction_signalKey_key" ON "UserInteraction"("signalKey");

-- CreateIndex
CREATE INDEX "UserInteraction_userId_idx" ON "UserInteraction"("userId");

-- CreateIndex
CREATE INDEX "UserInteraction_userId_createdAt_idx" ON "UserInteraction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserInteraction_recommendationId_idx" ON "UserInteraction"("recommendationId");

-- CreateIndex
CREATE INDEX "UserInteraction_itemId_idx" ON "UserInteraction"("itemId");

-- CreateIndex
CREATE INDEX "UserInteraction_action_idx" ON "UserInteraction"("action");

-- CreateIndex
CREATE INDEX "UserInteraction_feedbackId_idx" ON "UserInteraction"("feedbackId");

-- CreateIndex
CREATE INDEX "UserInteraction_createdAt_idx" ON "UserInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "RecommendationFeatureSnapshot_recommendationId_idx" ON "RecommendationFeatureSnapshot"("recommendationId");

-- CreateIndex
CREATE INDEX "RecommendationFeatureSnapshot_candidateId_idx" ON "RecommendationFeatureSnapshot"("candidateId");

-- CreateIndex
CREATE INDEX "RecommendationFeatureSnapshot_ranker_idx" ON "RecommendationFeatureSnapshot"("ranker");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_recommendation_log_id_idx" ON "recommendation_feedbacks"("recommendation_log_id");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_route_id_idx" ON "recommendation_feedbacks"("route_id");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_user_id_idx" ON "recommendation_feedbacks"("user_id");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_session_id_idx" ON "recommendation_feedbacks"("session_id");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_value_idx" ON "recommendation_feedbacks"("value");

-- CreateIndex
CREATE INDEX "recommendation_feedbacks_created_at_idx" ON "recommendation_feedbacks"("created_at");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

