-- Recommendation ownership
ALTER TABLE "RecommendationLog" ADD COLUMN "ownerUserId" UUID;
CREATE INDEX "RecommendationLog_ownerUserId_idx" ON "RecommendationLog"("ownerUserId");
ALTER TABLE "RecommendationLog" ADD CONSTRAINT "RecommendationLog_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "BuddyIntentMode" AS ENUM ('POST', 'AUTO');
CREATE TYPE "BuddyIntentStatus" AS ENUM ('ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BuddyApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED');
CREATE TYPE "BuddyGroupStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE "BuddyGroupMemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "BuddyGroupMemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');
CREATE TYPE "BuddyNotificationType" AS ENUM ('APPLICATION_RECEIVED', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'AUTO_MATCHED', 'GROUP_CANCELLED', 'MEMBER_LEFT', 'NEW_MESSAGE', 'REPORT_RECEIVED');
CREATE TYPE "BuddyReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');
CREATE TYPE "BuddyReportCategory" AS ENUM ('HARASSMENT', 'FRAUD', 'UNSAFE_BEHAVIOR', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'OTHER');

CREATE TABLE "BuddyPublicProfile" (
  "userId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "bio" TEXT,
  "city" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyPublicProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "BuddyIntent" (
  "id" TEXT NOT NULL,
  "ownerId" UUID NOT NULL,
  "mode" "BuddyIntentMode" NOT NULL,
  "status" "BuddyIntentStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT,
  "routeSnapshotId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "routeLocalId" TEXT NOT NULL,
  "routeSnapshot" JSONB NOT NULL,
  "city" TEXT NOT NULL,
  "area" TEXT,
  "departureStart" TIMESTAMP(3) NOT NULL,
  "departureEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "meetingLabel" TEXT NOT NULL,
  "meetingArea" TEXT,
  "meetingLat" DOUBLE PRECISION,
  "meetingLng" DOUBLE PRECISION,
  "publicNote" TEXT,
  "preferenceSpec" JSONB NOT NULL,
  "algorithmSnapshot" JSONB,
  "capacity" INTEGER NOT NULL DEFAULT 2,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "matchedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyApplication" (
  "id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "applicantId" UUID NOT NULL,
  "status" "BuddyApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "preferenceSnapshot" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyGroup" (
  "id" TEXT NOT NULL,
  "sourceMode" "BuddyIntentMode" NOT NULL,
  "status" "BuddyGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "capacity" INTEGER NOT NULL DEFAULT 2,
  "routeSnapshotId" TEXT NOT NULL,
  "routeSnapshot" JSONB NOT NULL,
  "city" TEXT NOT NULL,
  "area" TEXT,
  "departureStart" TIMESTAMP(3) NOT NULL,
  "departureEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "meetingLabel" TEXT NOT NULL,
  "meetingArea" TEXT,
  "meetingLat" DOUBLE PRECISION,
  "meetingLng" DOUBLE PRECISION,
  "createdById" UUID,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "role" "BuddyGroupMemberRole" NOT NULL,
  "status" "BuddyGroupMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "lastReadMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyMessage" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "senderId" UUID NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BuddyMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyNotification" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "type" "BuddyNotificationType" NOT NULL,
  "actorUserId" UUID,
  "intentId" TEXT,
  "applicationId" TEXT,
  "groupId" TEXT,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuddyNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyBlock" (
  "id" TEXT NOT NULL,
  "blockerId" UUID NOT NULL,
  "blockedId" UUID NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuddyBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuddyReport" (
  "id" TEXT NOT NULL,
  "reporterId" UUID NOT NULL,
  "reportedUserId" UUID,
  "groupId" TEXT,
  "messageId" TEXT,
  "category" "BuddyReportCategory" NOT NULL,
  "detail" TEXT,
  "status" "BuddyReportStatus" NOT NULL DEFAULT 'OPEN',
  "evidenceSnapshot" JSONB,
  "idempotencyKey" TEXT,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuddyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuddyIntent_ownerId_idempotencyKey_key" ON "BuddyIntent"("ownerId", "idempotencyKey");
CREATE INDEX "BuddyIntent_routeSnapshotId_mode_status_departureStart_idx" ON "BuddyIntent"("routeSnapshotId", "mode", "status", "departureStart");
CREATE INDEX "BuddyIntent_ownerId_status_idx" ON "BuddyIntent"("ownerId", "status");
CREATE INDEX "BuddyIntent_status_expiresAt_idx" ON "BuddyIntent"("status", "expiresAt");
CREATE UNIQUE INDEX "BuddyApplication_intentId_applicantId_key" ON "BuddyApplication"("intentId", "applicantId");
CREATE INDEX "BuddyApplication_applicantId_status_idx" ON "BuddyApplication"("applicantId", "status");
CREATE INDEX "BuddyApplication_intentId_status_createdAt_idx" ON "BuddyApplication"("intentId", "status", "createdAt");
CREATE INDEX "BuddyGroup_routeSnapshotId_status_idx" ON "BuddyGroup"("routeSnapshotId", "status");
CREATE INDEX "BuddyGroup_status_departureStart_idx" ON "BuddyGroup"("status", "departureStart");
CREATE INDEX "BuddyGroup_createdById_idx" ON "BuddyGroup"("createdById");
CREATE UNIQUE INDEX "BuddyGroupMember_groupId_userId_key" ON "BuddyGroupMember"("groupId", "userId");
CREATE INDEX "BuddyGroupMember_userId_status_idx" ON "BuddyGroupMember"("userId", "status");
CREATE INDEX "BuddyGroupMember_groupId_status_idx" ON "BuddyGroupMember"("groupId", "status");
CREATE UNIQUE INDEX "BuddyMessage_groupId_senderId_clientMessageId_key" ON "BuddyMessage"("groupId", "senderId", "clientMessageId");
CREATE INDEX "BuddyMessage_groupId_createdAt_id_idx" ON "BuddyMessage"("groupId", "createdAt", "id");
CREATE INDEX "BuddyNotification_userId_readAt_createdAt_idx" ON "BuddyNotification"("userId", "readAt", "createdAt");
CREATE INDEX "BuddyNotification_groupId_createdAt_idx" ON "BuddyNotification"("groupId", "createdAt");
CREATE UNIQUE INDEX "BuddyBlock_blockerId_blockedId_key" ON "BuddyBlock"("blockerId", "blockedId");
CREATE INDEX "BuddyBlock_blockedId_createdAt_idx" ON "BuddyBlock"("blockedId", "createdAt");
CREATE UNIQUE INDEX "BuddyReport_reporterId_idempotencyKey_key" ON "BuddyReport"("reporterId", "idempotencyKey");
CREATE INDEX "BuddyReport_reportedUserId_status_createdAt_idx" ON "BuddyReport"("reportedUserId", "status", "createdAt");
CREATE INDEX "BuddyReport_groupId_createdAt_idx" ON "BuddyReport"("groupId", "createdAt");
CREATE INDEX "BuddyReport_messageId_idx" ON "BuddyReport"("messageId");

ALTER TABLE "BuddyPublicProfile" ADD CONSTRAINT "BuddyPublicProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyIntent" ADD CONSTRAINT "BuddyIntent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyApplication" ADD CONSTRAINT "BuddyApplication_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "BuddyIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyApplication" ADD CONSTRAINT "BuddyApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyGroup" ADD CONSTRAINT "BuddyGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuddyGroupMember" ADD CONSTRAINT "BuddyGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BuddyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyGroupMember" ADD CONSTRAINT "BuddyGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyMessage" ADD CONSTRAINT "BuddyMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BuddyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyMessage" ADD CONSTRAINT "BuddyMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyNotification" ADD CONSTRAINT "BuddyNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyNotification" ADD CONSTRAINT "BuddyNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuddyNotification" ADD CONSTRAINT "BuddyNotification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BuddyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyBlock" ADD CONSTRAINT "BuddyBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyBlock" ADD CONSTRAINT "BuddyBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyReport" ADD CONSTRAINT "BuddyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuddyReport" ADD CONSTRAINT "BuddyReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuddyReport" ADD CONSTRAINT "BuddyReport_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BuddyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuddyReport" ADD CONSTRAINT "BuddyReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "BuddyMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
