CREATE TABLE "CityConditionSnapshot" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "venueId" TEXT,
    "condition" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityConditionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CityConditionSnapshot_city_idx" ON "CityConditionSnapshot"("city");
CREATE INDEX "CityConditionSnapshot_area_idx" ON "CityConditionSnapshot"("area");
CREATE INDEX "CityConditionSnapshot_venueId_idx" ON "CityConditionSnapshot"("venueId");
CREATE INDEX "CityConditionSnapshot_condition_idx" ON "CityConditionSnapshot"("condition");
CREATE INDEX "CityConditionSnapshot_capturedAt_idx" ON "CityConditionSnapshot"("capturedAt");
CREATE INDEX "CityConditionSnapshot_expiresAt_idx" ON "CityConditionSnapshot"("expiresAt");
CREATE INDEX "CityConditionSnapshot_city_area_condition_expiresAt_idx" ON "CityConditionSnapshot"("city", "area", "condition", "expiresAt");
