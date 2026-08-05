-- CreateEnum
CREATE TYPE "CommunityPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CommunityModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommunityImageStatus" AS ENUM ('RESERVED', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "CommunityAttachmentType" AS ENUM ('PLACE', 'ROUTE');

-- CreateEnum
CREATE TYPE "CommunityReportTargetType" AS ENUM ('POST', 'COMMENT', 'USER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "area" TEXT,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "CommunityModerationStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "deletedByAuthorAt" TIMESTAMP(3),
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "uploaderId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "CommunityImageStatus" NOT NULL DEFAULT 'RESERVED',
    "originalObjectPath" TEXT NOT NULL,
    "processedObjectPath" TEXT,
    "publicObjectPath" TEXT,
    "publicUrl" TEXT,
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT,
    "altText" TEXT,
    "validationError" TEXT,
    "validatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" "CommunityAttachmentType" NOT NULL,
    "position" INTEGER NOT NULL,
    "venueId" TEXT,
    "routeSnapshotId" TEXT,
    "routeSnapshot" JSONB,
    "titleSnapshot" TEXT NOT NULL,
    "subtitleSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderationStatus" "CommunityModerationStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostLike" (
    "postId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityBookmark" (
    "postId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBookmark_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityFollow" (
    "followerId" UUID NOT NULL,
    "followingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFollow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" "CommunityReportTargetType" NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reportedUserId" UUID,
    "category" "BuddyReportCategory" NOT NULL,
    "detail" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "evidenceSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityModerationAction" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reportId" TEXT,
    "actorUserId" UUID,
    "actorType" "ModerationActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPost_status_city_publishedAt_id_idx" ON "CommunityPost"("status", "city", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_status_publishedAt_id_idx" ON "CommunityPost"("authorId", "status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "CommunityPost_moderationStatus_reportCount_publishedAt_idx" ON "CommunityPost"("moderationStatus", "reportCount", "publishedAt");

-- CreateIndex
CREATE INDEX "CommunityPost_status_area_publishedAt_id_idx" ON "CommunityPost"("status", "area", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPost_authorId_idempotencyKey_key" ON "CommunityPost"("authorId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostImage_originalObjectPath_key" ON "CommunityPostImage"("originalObjectPath");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostImage_publicObjectPath_key" ON "CommunityPostImage"("publicObjectPath");

-- CreateIndex
CREATE INDEX "CommunityPostImage_postId_status_idx" ON "CommunityPostImage"("postId", "status");

-- CreateIndex
CREATE INDEX "CommunityPostImage_uploaderId_createdAt_idx" ON "CommunityPostImage"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPostImage_sha256_idx" ON "CommunityPostImage"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostImage_postId_position_key" ON "CommunityPostImage"("postId", "position");

-- CreateIndex
CREATE INDEX "CommunityPostAttachment_postId_type_idx" ON "CommunityPostAttachment"("postId", "type");

-- CreateIndex
CREATE INDEX "CommunityPostAttachment_venueId_idx" ON "CommunityPostAttachment"("venueId");

-- CreateIndex
CREATE INDEX "CommunityPostAttachment_routeSnapshotId_idx" ON "CommunityPostAttachment"("routeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostAttachment_postId_position_key" ON "CommunityPostAttachment"("postId", "position");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_status_createdAt_id_idx" ON "CommunityComment"("postId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_createdAt_idx" ON "CommunityComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_moderationStatus_reportCount_createdAt_idx" ON "CommunityComment"("moderationStatus", "reportCount", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityComment_authorId_idempotencyKey_key" ON "CommunityComment"("authorId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CommunityPostLike_userId_createdAt_idx" ON "CommunityPostLike"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityBookmark_userId_createdAt_idx" ON "CommunityBookmark"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityFollow_followingId_createdAt_idx" ON "CommunityFollow"("followingId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_postId_status_createdAt_idx" ON "CommunityReport"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_commentId_status_createdAt_idx" ON "CommunityReport"("commentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_reportedUserId_status_createdAt_idx" ON "CommunityReport"("reportedUserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_idempotencyKey_key" ON "CommunityReport"("reporterId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CommunityModerationAction_postId_createdAt_idx" ON "CommunityModerationAction"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModerationAction_commentId_createdAt_idx" ON "CommunityModerationAction"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModerationAction_reportId_createdAt_idx" ON "CommunityModerationAction"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModerationAction_actorUserId_createdAt_idx" ON "CommunityModerationAction"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostImage" ADD CONSTRAINT "CommunityPostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostImage" ADD CONSTRAINT "CommunityPostImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostAttachment" ADD CONSTRAINT "CommunityPostAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostAttachment" ADD CONSTRAINT "CommunityPostAttachment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostLike" ADD CONSTRAINT "CommunityPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostLike" ADD CONSTRAINT "CommunityPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBookmark" ADD CONSTRAINT "CommunityBookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBookmark" ADD CONSTRAINT "CommunityBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModerationAction" ADD CONSTRAINT "CommunityModerationAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModerationAction" ADD CONSTRAINT "CommunityModerationAction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModerationAction" ADD CONSTRAINT "CommunityModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CommunityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModerationAction" ADD CONSTRAINT "CommunityModerationAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Domain integrity checks not expressible in Prisma schema.
ALTER TABLE "CommunityPostAttachment" ADD CONSTRAINT "CommunityPostAttachment_target_check" CHECK (
  ("type" = 'PLACE' AND "venueId" IS NOT NULL AND "routeSnapshotId" IS NULL AND "routeSnapshot" IS NULL) OR
  ("type" = 'ROUTE' AND "venueId" IS NULL AND "routeSnapshotId" IS NOT NULL AND "routeSnapshot" IS NOT NULL)
);
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_no_self_check" CHECK ("followerId" <> "followingId");
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_target_check" CHECK (
  ("targetType" = 'POST' AND "postId" IS NOT NULL AND "commentId" IS NULL) OR
  ("targetType" = 'COMMENT' AND "postId" IS NULL AND "commentId" IS NOT NULL) OR
  ("targetType" = 'USER' AND "postId" IS NULL AND "commentId" IS NULL AND "reportedUserId" IS NOT NULL)
);
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_counts_check" CHECK ("likeCount" >= 0 AND "commentCount" >= 0 AND "bookmarkCount" >= 0 AND "reportCount" >= 0);
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_report_count_check" CHECK ("reportCount" >= 0);
