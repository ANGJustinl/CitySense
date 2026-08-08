import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { completePostImage } from "@/server/community/post-images";

const CLIENT_ERRORS = new Set([
  "图片不存在",
  "图片体积超过限制",
  "图片格式不支持",
  "图片分辨率过低"
]);

export async function POST(_request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    await enforceRateLimit("community:image", user.appUser.id, RATE_LIMITS.communityImage);
    const { id, imageId } = await context.params;
    return NextResponse.json(await completePostImage({ postId: id, imageId, uploaderId: user.appUser.id }));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    if (error instanceof Error && CLIENT_ERRORS.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("community post image complete failed", {
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "图片校验失败" }, { status: 500 });
  }
}
