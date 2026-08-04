-- Add an epoch boundary so clearing a profile never replays older behavior.
ALTER TABLE "UserPreference"
ADD COLUMN "profileResetAt" TIMESTAMP(3);

-- Link normalized profile signals to their source facts and make projection retries idempotent.
ALTER TABLE "UserInteraction"
ADD COLUMN "feedbackId" TEXT,
ADD COLUMN "signalKey" TEXT,
ADD COLUMN "signalKind" TEXT;

CREATE UNIQUE INDEX "UserInteraction_signalKey_key"
ON "UserInteraction"("signalKey");

CREATE INDEX "UserInteraction_userId_createdAt_idx"
ON "UserInteraction"("userId", "createdAt");

CREATE INDEX "UserInteraction_feedbackId_idx"
ON "UserInteraction"("feedbackId");
