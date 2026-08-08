import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { getOwnSubmission, updateOwnSubmission, withdrawOwnSubmission, SubmissionActionError } from "@/server/submissions/service";

function actionErrorResponse(error: unknown) {
  if (!(error instanceof SubmissionActionError)) return null;
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const submission = await getOwnSubmission(user.appUser.id, id);
    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    return NextResponse.json(submission);
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Submission read failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    const { id } = await context.params;
    const body = await request.json() as { expectedVersion?: number; [key: string]: unknown };
    if (!Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
    const { expectedVersion, ...payload } = body;
    const updated = await updateOwnSubmission({ submitterId: user.appUser.id, id, expectedVersion: expectedVersion as number, payload });
    return NextResponse.json(updated);
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? actionErrorResponse(error) ?? NextResponse.json({ error: "Submission update failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    const { id } = await context.params;
    const body = await request.json() as { expectedVersion?: number };
    if (!Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
    const result = await withdrawOwnSubmission({ submitterId: user.appUser.id, id, expectedVersion: body.expectedVersion as number });
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? actionErrorResponse(error) ?? NextResponse.json({ error: "Submission delete failed" }, { status: 500 });
  }
}
