-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VenuePublicationStatus" AS ENUM ('PUBLISHED', 'UNLISTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "VenueSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'AUTO_PUBLISHED', 'NEEDS_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REMOVED');

-- CreateEnum
CREATE TYPE "SubmissionMatchType" AS ENUM ('EXISTING_EXACT', 'EXISTING_PROBABLE', 'AMAP_EXACT', 'AMAP_PROBABLE', 'NOVEL', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "SubmissionImageStatus" AS ENUM ('RESERVED', 'UPLOADED', 'VALIDATING', 'SAFE', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ModerationActorType" AS ENUM ('SYSTEM', 'MODERATOR', 'ADMIN', 'USER');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "createdFromSubmissionId" TEXT,
ADD COLUMN     "publicationReason" TEXT,
ADD COLUMN     "publicationStatus" "VenuePublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "publicationVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "unpublishedAt" TIMESTAMP(3);

UPDATE "Venue" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;

-- CreateTable
CREATE TABLE "AppUser" (
    "id" UUID NOT NULL,
    "role" "AppRole" NOT NULL DEFAULT 'USER',
    "emailSnapshot" TEXT,
    "disabledAt" TIMESTAMP(3),
    "lastSignedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueSubmission" (
    "id" TEXT NOT NULL,
    "submitterId" UUID NOT NULL,
    "status" "VenueSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT NOT NULL,
    "userLat" DOUBLE PRECISION,
    "userLng" DOUBLE PRECISION,
    "verifiedAddress" TEXT,
    "verifiedLat" DOUBLE PRECISION,
    "verifiedLng" DOUBLE PRECISION,
    "tags" TEXT[],
    "accessTips" TEXT,
    "selectedAmapPoiId" TEXT,
    "selectedAmapSnapshot" JSONB,
    "matchType" "SubmissionMatchType",
    "matchedVenueId" TEXT,
    "resultingVenueId" TEXT,
    "contentHash" TEXT,
    "technicalFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "automatedResult" JSONB,
    "publicStatusMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "processingLeaseUntil" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionImage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "originalObjectPath" TEXT NOT NULL,
    "processedObjectPath" TEXT,
    "status" "SubmissionImageStatus" NOT NULL DEFAULT 'RESERVED',
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT,
    "validationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "SubmissionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueImage" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "submissionId" TEXT,
    "objectPath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionModerationAction" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorUserId" UUID,
    "actorType" "ModerationActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "VenueSubmissionStatus",
    "toStatus" "VenueSubmissionStatus" NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueSubmission_submitterId_createdAt_idx" ON "VenueSubmission"("submitterId", "createdAt");

-- CreateIndex
CREATE INDEX "VenueSubmission_status_submittedAt_idx" ON "VenueSubmission"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "VenueSubmission_city_status_idx" ON "VenueSubmission"("city", "status");

-- CreateIndex
CREATE INDEX "VenueSubmission_contentHash_idx" ON "VenueSubmission"("contentHash");

-- CreateIndex
CREATE INDEX "VenueSubmission_matchedVenueId_idx" ON "VenueSubmission"("matchedVenueId");

-- CreateIndex
CREATE INDEX "VenueSubmission_resultingVenueId_idx" ON "VenueSubmission"("resultingVenueId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueSubmission_submitterId_idempotencyKey_key" ON "VenueSubmission"("submitterId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionImage_originalObjectPath_key" ON "SubmissionImage"("originalObjectPath");

-- CreateIndex
CREATE INDEX "SubmissionImage_submissionId_status_idx" ON "SubmissionImage"("submissionId", "status");

-- CreateIndex
CREATE INDEX "SubmissionImage_sha256_idx" ON "SubmissionImage"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "VenueImage_objectPath_key" ON "VenueImage"("objectPath");

-- CreateIndex
CREATE INDEX "VenueImage_venueId_published_idx" ON "VenueImage"("venueId", "published");

-- CreateIndex
CREATE INDEX "VenueImage_submissionId_idx" ON "VenueImage"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionModerationAction_submissionId_createdAt_idx" ON "SubmissionModerationAction"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionModerationAction_actorUserId_createdAt_idx" ON "SubmissionModerationAction"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_createdFromSubmissionId_key" ON "Venue"("createdFromSubmissionId");

-- CreateIndex
CREATE INDEX "Venue_publicationStatus_city_area_idx" ON "Venue"("publicationStatus", "city", "area");

-- AddForeignKey
ALTER TABLE "VenueSubmission" ADD CONSTRAINT "VenueSubmission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueSubmission" ADD CONSTRAINT "VenueSubmission_matchedVenueId_fkey" FOREIGN KEY ("matchedVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueSubmission" ADD CONSTRAINT "VenueSubmission_resultingVenueId_fkey" FOREIGN KEY ("resultingVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionImage" ADD CONSTRAINT "SubmissionImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "VenueSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueImage" ADD CONSTRAINT "VenueImage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionModerationAction" ADD CONSTRAINT "SubmissionModerationAction_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "VenueSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionModerationAction" ADD CONSTRAINT "SubmissionModerationAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

