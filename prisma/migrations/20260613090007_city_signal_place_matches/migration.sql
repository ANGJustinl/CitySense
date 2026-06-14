CREATE TABLE IF NOT EXISTS "CitySignalPlaceMatch" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "rawSourceItemId" TEXT,
  "citySignalId" TEXT,
  "venueId" TEXT,
  "status" TEXT NOT NULL,
  "algorithmScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "llmConfidence" DOUBLE PRECISION,
  "matchedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reason" TEXT,
  "metadata" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CitySignalPlaceMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_source_idx"
  ON "CitySignalPlaceMatch"("source");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_status_idx"
  ON "CitySignalPlaceMatch"("status");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_rawSourceItemId_idx"
  ON "CitySignalPlaceMatch"("rawSourceItemId");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_citySignalId_idx"
  ON "CitySignalPlaceMatch"("citySignalId");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_venueId_idx"
  ON "CitySignalPlaceMatch"("venueId");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_source_status_idx"
  ON "CitySignalPlaceMatch"("source", "status");

CREATE INDEX IF NOT EXISTS "CitySignalPlaceMatch_venueId_status_idx"
  ON "CitySignalPlaceMatch"("venueId", "status");
