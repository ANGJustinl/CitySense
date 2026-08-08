import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { prisma } from "@/server/db/prisma";
import { enqueueSubmissionReview, isSubmissionQueueConfigured } from "@/server/submissions/queue";
import { processSubmission } from "@/server/submissions/process";
import { SubmissionActionError } from "@/server/submissions/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("submission:submit", user.appUser.id, RATE_LIMITS.submissionSubmit);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { expectedVersion?: number };
    if (!Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
    const submission = await prisma.venueSubmission.findFirst({ where: { id, submitterId: user.appUser.id }, include: { images: true } });
    if (!submission || !["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(submission.status) || submission.version !== body.expectedVersion) throw new SubmissionActionError("version_conflict", "投稿状态已更新，请刷新后重试", 409);
    if (!submission.images.some((image) => image.status === "SAFE")) return NextResponse.json({ error: "At least one validated image is required" }, { status: 400 });
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.venueSubmission.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
      await tx.submissionModerationAction.create({ data: { submissionId: id, actorUserId: user.appUser.id, actorType: "USER", action: submission.status === "REJECTED" ? "RESUBMIT" : "SUBMIT", fromStatus: submission.status, toStatus: "SUBMITTED" } });
      return value;
    });
    try {
      if (isSubmissionQueueConfigured()) await enqueueSubmissionReview(id, updated.version);
      else await processSubmission(id);
    } catch (error) {
      await prisma.venueSubmission.update({ where: { id }, data: { status: "NEEDS_REVIEW", technicalFlags: ["queue_enqueue_failed"], publicStatusMessage: "自动处理失败，可以重试" } });
    }
    return NextResponse.json(await prisma.venueSubmission.findUnique({ where: { id }, include: { images: true, resultingVenue: true } }), { status: 202 });
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? rateLimitErrorResponse(error) ?? (error instanceof SubmissionActionError ? NextResponse.json({ error: error.message, code: error.code }, { status: error.status }) : NextResponse.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 500 }));
  }
}
