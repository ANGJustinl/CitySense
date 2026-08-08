-- CreateEnum
CREATE TYPE "ChatImageStatus" AS ENUM ('TEMP', 'ATTACHED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ChatImage" (
    "id" TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "status" "ChatImageStatus" NOT NULL DEFAULT 'TEMP',
    "objectPath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT,
    "attachedKind" TEXT,
    "attachedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatImage_objectPath_key" ON "ChatImage"("objectPath");

-- CreateIndex
CREATE INDEX "ChatImage_ownerUserId_status_idx" ON "ChatImage"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "ChatImage_status_createdAt_idx" ON "ChatImage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatImage" ADD CONSTRAINT "ChatImage_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
