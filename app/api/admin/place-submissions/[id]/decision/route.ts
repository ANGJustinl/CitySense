import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/prisma";
import { processSubmission } from "@/server/submissions/process";

const schema = z.object({
  decision: z.enum(["APPROVE_AS_NEW", "LINK_EXISTING", "REQUEST_CHANGES", "REJECT"]),
  expectedVersion: z.number().int().positive(),
  venueId: z.string().optional(),
  reason: z.string().trim().min(2).max(300).optional()
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const current = await prisma.venueSubmission.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    if (current.version !== input.expectedVersion) return NextResponse.json({ error: "Submission was updated", currentVersion: current.version }, { status: 409 });
    if (input.decision === "LINK_EXISTING") {
      if (!input.venueId) return NextResponse.json({ error: "venueId is required" }, { status: 400 });
      const venue = await prisma.venue.findUnique({ where: { id: input.venueId } });
      if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
      await prisma.$transaction([
        prisma.venueSubmission.update({ where: { id }, data: { status: "APPROVED", matchedVenueId: venue.id, resultingVenueId: venue.id, reviewedAt: new Date(), version: { increment: 1 }, publicStatusMessage: "已关联到现有地点" } }),
        prisma.submissionModerationAction.create({ data: { submissionId: id, actorUserId: admin.appUser.id, actorType: admin.appUser.role, action: "LINK_EXISTING", fromStatus: current.status, toStatus: "APPROVED", reasonText: input.reason, metadata: { venueId: venue.id } } })
      ]);
    } else if (input.decision === "APPROVE_AS_NEW") {
      await prisma.venueSubmission.update({ where: { id }, data: { status: "SUBMITTED", version: { increment: 1 }, technicalFlags: [] } });
      await processSubmission(id);
    } else {
      const toStatus = input.decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
      if (!input.reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });
      await prisma.$transaction([
        prisma.venueSubmission.update({ where: { id }, data: { status: toStatus, reviewedAt: new Date(), version: { increment: 1 }, publicStatusMessage: input.reason } }),
        prisma.submissionModerationAction.create({ data: { submissionId: id, actorUserId: admin.appUser.id, actorType: admin.appUser.role, action: input.decision, fromStatus: current.status, toStatus, reasonText: input.reason } })
      ]);
    }
    return NextResponse.json(await prisma.venueSubmission.findUnique({ where: { id }, include: { images: true, resultingVenue: true } }));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid decision", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: "Decision failed" }, { status: 500 });
  }
}
