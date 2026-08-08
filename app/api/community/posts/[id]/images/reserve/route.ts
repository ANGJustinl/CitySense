import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { reservePostImage } from "@/server/community/post-images";

const schema = z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict();

const CLIENT_ERRORS = new Set([
  "仅支持 JPEG、PNG 和 WebP",
  "手记不存在或不可编辑"
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    await enforceRateLimit("community:image", user.appUser.id, RATE_LIMITS.communityImage);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await reservePostImage({ postId: id, uploaderId: user.appUser.id, mimeType: body.mimeType }), { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    if (error instanceof ZodError) return NextResponse.json({ error: "图片请求参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof Error && (CLIENT_ERRORS.has(error.message) || error.message.startsWith("图片数量已达上限"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("community post image reserve failed", {
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "图片预留失败" }, { status: 500 });
  }
}
