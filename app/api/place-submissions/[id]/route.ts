import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { getOwnSubmission } from "@/server/submissions/service";

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
