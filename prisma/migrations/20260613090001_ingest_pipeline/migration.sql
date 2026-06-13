-- Deduplicate historical connector rows before adding a unique index.
DELETE FROM "SourceConnector" a
USING "SourceConnector" b
WHERE a."name" = b."name"
  AND a.ctid < b.ctid;

-- Source connector runtime state.
ALTER TABLE "SourceConnector"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "lastRunId" TEXT,
  ADD COLUMN "lastRunAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "SourceConnector_name_key" ON "SourceConnector"("name");

-- Ingest run records.
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

CREATE INDEX "IngestRun_status_idx" ON "IngestRun"("status");
CREATE INDEX "IngestRun_createdAt_idx" ON "IngestRun"("createdAt");

-- Raw source traceability and normalization links.
ALTER TABLE "RawSourceItem"
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "parsedPayload" JSONB,
  ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'event',
  ADD COLUMN "normalizedEntityType" TEXT,
  ADD COLUMN "normalizedEntityId" TEXT,
  ADD COLUMN "ingestRunId" TEXT,
  ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RawSourceItem"
SET "sourceKey" = "source" || ':' || COALESCE("sourceId", "id"),
    "firstSeenAt" = "createdAt",
    "lastSeenAt" = "createdAt"
WHERE "sourceKey" IS NULL;

ALTER TABLE "RawSourceItem"
  ALTER COLUMN "sourceKey" SET NOT NULL;

CREATE UNIQUE INDEX "RawSourceItem_sourceKey_key" ON "RawSourceItem"("sourceKey");
CREATE INDEX "RawSourceItem_ingestRunId_idx" ON "RawSourceItem"("ingestRunId");

-- Normalized entity upsert keys.
ALTER TABLE "Event" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Venue" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "Event_sourceKey_key" ON "Event"("sourceKey");
CREATE UNIQUE INDEX "Venue_sourceKey_key" ON "Venue"("sourceKey");
