import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { createSubmission, listOwnSubmissions } from "@/server/submissions/service";
import { ZodError } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ submissions: await listOwnSubmissions(user.appUser.id) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Submission list failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const submission = await createSubmission({
      submitterId: user.appUser.id,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
      payload: body
    });
    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid submission", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: "Submission creation failed" }, { status: 500 });
  }
}
