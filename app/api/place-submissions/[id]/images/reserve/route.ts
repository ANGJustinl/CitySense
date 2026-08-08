import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { describeSubmissionImageError, reserveSubmissionImage, SubmissionImageError } from "@/server/submissions/images";

const schema = z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const { id } = await context.params;
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("submission:image", user.appUser.id, RATE_LIMITS.submissionImage);
    const body = schema.parse(await request.json());
    const result = await reserveSubmissionImage({ submissionId: id, submitterId: user.appUser.id, mimeType: body.mimeType });
    return NextResponse.json(result, { status: 201, headers: { "x-request-id": requestId } });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", code: "invalid_image_request", requestId }, { status: 400 });
    const detail = describeSubmissionImageError(error);
    console.error("submission image reserve failed", {
      requestId,
      operation: "submission_image.reserve",
      submissionId: id,
      bucket: process.env.CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals",
      release: process.env.CITYSENSE_RELEASE ?? "development",
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      error: detail
    });
    const safe = error instanceof SubmissionImageError
      ? detail
      : { code: "storage_unavailable", status: 503, message: "图片存储服务暂时不可用，请稍后重试" };
    return NextResponse.json({ error: safe.message, code: safe.code, requestId }, { status: safe.status, headers: { "x-request-id": requestId } });
  }
}
