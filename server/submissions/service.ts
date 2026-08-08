import { Prisma, type VenueSubmissionStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { placeSubmissionSchema, submissionContentHash } from "@/server/submissions/schema";

export async function updateOwnSubmission(input: {
  submitterId: string;
  id: string;
  expectedVersion: number;
  payload: unknown;
}) {
  const data = placeSubmissionSchema.parse(input.payload);
  const current = await prisma.venueSubmission.findFirst({ where: { id: input.id, submitterId: input.submitterId } });
  if (!current) throw new SubmissionActionError("submission_not_found", "投稿不存在", 404);
  if (current.version !== input.expectedVersion) throw new SubmissionActionError("version_conflict", "投稿已被更新，请刷新后重试", 409);
  if (!["DRAFT", "CHANGES_REQUESTED", "REJECTED", "AUTO_PUBLISHED", "APPROVED"].includes(current.status)) {
    throw new SubmissionActionError("submission_not_editable", "当前状态暂不能编辑", 409);
  }
  const contentHash = submissionContentHash(data);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.venueSubmission.updateMany({
      where: { id: input.id, submitterId: input.submitterId, version: input.expectedVersion },
      data: {
        ...data,
        contentHash,
        status: current.status === "AUTO_PUBLISHED" || current.status === "APPROVED" ? "DRAFT" : current.status,
        verifiedAddress: null,
        verifiedLat: null,
        verifiedLng: null,
        matchType: null,
        matchedVenueId: null,
        technicalFlags: [],
        automatedResult: Prisma.DbNull,
        publicStatusMessage: null,
        submittedAt: null,
        processingStartedAt: null,
        processingLeaseUntil: null,
        version: { increment: 1 }
      }
    });
    if (!updated.count) throw new SubmissionActionError("version_conflict", "投稿已被更新，请刷新后重试", 409);
    await tx.submissionModerationAction.create({ data: { submissionId: input.id, actorUserId: input.submitterId, actorType: "USER", action: "UPDATE", fromStatus: current.status, toStatus: current.status === "AUTO_PUBLISHED" || current.status === "APPROVED" ? "DRAFT" : current.status } });
    return tx.venueSubmission.findUnique({ where: { id: input.id }, include: { images: true, resultingVenue: true } });
  });
}

export async function withdrawOwnSubmission(input: { submitterId: string; id: string; expectedVersion: number }) {
  const current = await prisma.venueSubmission.findFirst({ where: { id: input.id, submitterId: input.submitterId }, include: { resultingVenue: true } });
  if (!current) throw new SubmissionActionError("submission_not_found", "投稿不存在", 404);
  if (current.version !== input.expectedVersion) throw new SubmissionActionError("version_conflict", "投稿已被更新，请刷新后重试", 409);
  if (!["DRAFT", "CHANGES_REQUESTED", "REJECTED", "SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "AUTO_PUBLISHED", "APPROVED"].includes(current.status)) throw new SubmissionActionError("submission_not_deletable", "当前状态不能删除", 409);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.venueSubmission.updateMany({ where: { id: input.id, submitterId: input.submitterId, version: input.expectedVersion }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), version: { increment: 1 } } });
    if (!updated.count) throw new SubmissionActionError("version_conflict", "投稿已被更新，请刷新后重试", 409);
    if (current.resultingVenue?.createdFromSubmissionId === current.id) {
      await tx.venue.update({ where: { id: current.resultingVenue.id }, data: { publicationStatus: "REMOVED", unpublishedAt: new Date() } });
      await tx.venueImage.updateMany({ where: { venueId: current.resultingVenue.id, submissionId: current.id }, data: { published: false } });
    }
    await tx.submissionModerationAction.create({ data: { submissionId: input.id, actorUserId: input.submitterId, actorType: "USER", action: "WITHDRAW", fromStatus: current.status, toStatus: "WITHDRAWN", reasonText: "投稿者撤回" } });
    return { ok: true };
  });
}

export class SubmissionActionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

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
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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
