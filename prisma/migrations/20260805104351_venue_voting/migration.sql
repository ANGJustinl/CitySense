-- CreateEnum
CREATE TYPE "VenueVoteType" AS ENUM ('NICHE', 'HOT');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "hotVoteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nicheVoteCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VenueVote" (
    "venueId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" "VenueVoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueVote_pkey" PRIMARY KEY ("venueId","userId")
);

-- CreateIndex
CREATE INDEX "VenueVote_type_venueId_idx" ON "VenueVote"("type", "venueId");

-- CreateIndex
CREATE INDEX "VenueVote_userId_createdAt_idx" ON "VenueVote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Venue_city_publicationStatus_nicheVoteCount_idx" ON "Venue"("city", "publicationStatus", "nicheVoteCount");

-- CreateIndex
CREATE INDEX "Venue_city_publicationStatus_hotVoteCount_idx" ON "Venue"("city", "publicationStatus", "hotVoteCount");

-- AddForeignKey
ALTER TABLE "VenueVote" ADD CONSTRAINT "VenueVote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueVote" ADD CONSTRAINT "VenueVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restore GIN indexes that an earlier draft of this migration inadvertently dropped.
-- These were created by 20260613090003_recommendation_v1 and 20260613090005_signal_backed_routes
-- (native SQL, not declared in schema.prisma) and must be preserved.
CREATE INDEX IF NOT EXISTS "Event_title_trgm_idx" ON "Event" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Event_address_trgm_idx" ON "Event" USING GIN ("address" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Venue_name_trgm_idx" ON "Venue" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Venue_address_trgm_idx" ON "Venue" USING GIN ("address" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Event_qualityFlags_idx" ON "Event" USING GIN ("qualityFlags");
CREATE INDEX IF NOT EXISTS "Venue_qualityFlags_idx" ON "Venue" USING GIN ("qualityFlags");
