import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { reserveSubmissionImage } from "@/server/submissions/images";

const schema = z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict();
const IMAGE_RESERVE_CLIENT_ERRORS = new Set([
  "Only JPEG, PNG and WebP are supported",
  "Submission not found or not editable",
  "Image limit reached"
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("submission:image", user.appUser.id, RATE_LIMITS.submissionImage);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await reserveSubmissionImage({ submissionId: id, submitterId: user.appUser.id, mimeType: body.mimeType }), { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.issues }, { status: 400 });
    if (error instanceof Error && IMAGE_RESERVE_CLIENT_ERRORS.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("submission image reserve failed", {
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "Image reserve failed" }, { status: 500 });
  }
}
