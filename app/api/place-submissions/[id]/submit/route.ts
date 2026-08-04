import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/prisma";
import { enqueueSubmissionReview, isSubmissionQueueConfigured } from "@/server/submissions/queue";
import { processSubmission } from "@/server/submissions/process";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const submission = await prisma.venueSubmission.findFirst({
      where: { id, submitterId: user.appUser.id, status: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
      include: { images: true }
    });
    if (!submission) return NextResponse.json({ error: "Submission not found or not editable" }, { status: 404 });
    if (!submission.images.some((image) => image.status === "SAFE")) return NextResponse.json({ error: "At least one validated image is required" }, { status: 400 });
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.venueSubmission.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
      await tx.submissionModerationAction.create({ data: { submissionId: id, actorUserId: user.appUser.id, actorType: "USER", action: "SUBMIT", fromStatus: submission.status, toStatus: "SUBMITTED" } });
      return value;
    });
    if (isSubmissionQueueConfigured()) await enqueueSubmissionReview(id, updated.version);
    else await processSubmission(id);
    return NextResponse.json(await prisma.venueSubmission.findUnique({ where: { id }, include: { images: true, resultingVenue: true } }), { status: 202 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 500 });
  }
}
