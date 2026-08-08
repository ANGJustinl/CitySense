import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { cancelSubmissionImage, describeSubmissionImageError, SubmissionImageError } from "@/server/submissions/images";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const { id, imageId } = await context.params;
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("submission:image", user.appUser.id, RATE_LIMITS.submissionImage);
    await cancelSubmissionImage({ submissionId: id, imageId, submitterId: user.appUser.id });
    return NextResponse.json({ ok: true, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    const detail = describeSubmissionImageError(error);
    const safe = error instanceof SubmissionImageError ? detail : { code: "internal_error", status: 500, message: "图片取消失败，请稍后重试" };
    console.error("submission image cancel failed", { requestId, operation: "submission_image.cancel", submissionId: id, imageId, error: detail });
    return NextResponse.json({ error: safe.message, code: safe.code, requestId }, { status: safe.status, headers: { "x-request-id": requestId } });
  }
}
