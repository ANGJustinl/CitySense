import { Prisma, type VenueSubmissionStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { placeSubmissionSchema, submissionContentHash } from "@/server/submissions/schema";

export async function createSubmission(input: {
  submitterId: string;
  idempotencyKey?: string;
  payload: unknown;
}) {
  const data = placeSubmissionSchema.parse(input.payload);
  const contentHash = submissionContentHash(data);
  if (input.idempotencyKey) {
    const existing = await prisma.venueSubmission.findUnique({
      where: { submitterId_idempotencyKey: { submitterId: input.submitterId, idempotencyKey: input.idempotencyKey } },
      include: { images: true }
    });
    if (existing) return existing;
  }
  return prisma.venueSubmission.create({
    data: {
      submitterId: input.submitterId,
      idempotencyKey: input.idempotencyKey,
      ...data,
      contentHash
    },
    include: { images: true }
  });
}

export async function listOwnSubmissions(submitterId: string) {
  return prisma.venueSubmission.findMany({
    where: { submitterId },
    include: { images: true, resultingVenue: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}

export async function getOwnSubmission(submitterId: string, id: string) {
  return prisma.venueSubmission.findFirst({
    where: { id, submitterId },
    include: {
      images: true,
      resultingVenue: true,
      moderationActions: { orderBy: { createdAt: "asc" } }
    }
  });
}

export async function recordSystemAction(input: {
  submissionId: string;
  action: string;
  fromStatus?: VenueSubmissionStatus;
  toStatus: VenueSubmissionStatus;
  reasonCode?: string;
  metadata?: unknown;
}) {
  return prisma.submissionModerationAction.create({
    data: {
      submissionId: input.submissionId,
      actorType: "SYSTEM",
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reasonCode: input.reasonCode,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue : undefined
    }
  });
}
