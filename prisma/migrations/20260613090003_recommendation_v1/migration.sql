-- Recommendation V1: feedback, feature snapshots, and Postgres-assisted recall.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "UserInteraction" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "recommendationId" TEXT,
  "routeId" TEXT,
  "itemId" TEXT,
  "itemType" TEXT,
  "action" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "UserInteraction_userId_idx" ON "UserInteraction"("userId");
CREATE INDEX "UserInteraction_recommendationId_idx" ON "UserInteraction"("recommendationId");
CREATE INDEX "UserInteraction_itemId_idx" ON "UserInteraction"("itemId");
CREATE INDEX "UserInteraction_action_idx" ON "UserInteraction"("action");
CREATE INDEX "UserInteraction_createdAt_idx" ON "UserInteraction"("createdAt");

CREATE INDEX "RecommendationFeatureSnapshot_recommendationId_idx" ON "RecommendationFeatureSnapshot"("recommendationId");
CREATE INDEX "RecommendationFeatureSnapshot_candidateId_idx" ON "RecommendationFeatureSnapshot"("candidateId");
CREATE INDEX "RecommendationFeatureSnapshot_ranker_idx" ON "RecommendationFeatureSnapshot"("ranker");

CREATE INDEX IF NOT EXISTS "Event_title_trgm_idx" ON "Event" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Event_address_trgm_idx" ON "Event" USING GIN ("address" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Venue_name_trgm_idx" ON "Venue" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Venue_address_trgm_idx" ON "Venue" USING GIN ("address" gin_trgm_ops);
