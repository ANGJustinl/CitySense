import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { completeSubmissionImage } from "@/server/submissions/images";

export async function POST(_request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("submission:image", user.appUser.id, RATE_LIMITS.submissionImage);
    const { id, imageId } = await context.params;
    return NextResponse.json(await completeSubmissionImage({ submissionId: id, imageId, submitterId: user.appUser.id }));
  } catch (error) {
    return authErrorResponse(error)
      ?? featureErrorResponse(error)
      ?? rateLimitErrorResponse(error)
      ?? NextResponse.json({ error: error instanceof Error ? error.message : "Image validation failed" }, { status: 400 });
  }
}
