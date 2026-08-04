import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { completeSubmissionImage } from "@/server/submissions/images";

export async function POST(_request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const user = await requireUser();
    const { id, imageId } = await context.params;
    return NextResponse.json(await completeSubmissionImage({ submissionId: id, imageId, submitterId: user.appUser.id }));
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Image validation failed" }, { status: 400 });
  }
}
