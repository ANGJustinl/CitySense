/**
 * AI 助手聊天图直传端点。
 *
 * POST /api/chat/images  multipart/form-data  field "file"
 * 接收一张图片 → 校验 → sharp 转码 → 存入 chat-images 桶 → 建 ChatImage(TEMP)行。
 * 返回 { id, url, mimeType, byteSize, width, height }。
 *
 * 该 url 同时用于:
 *  (a) 视觉对话:作为 image_url 传给 glm-4.5v;
 *  (b) 第 3 层:用户确认发手记/投稿时,按 id 把暂存图绑定到 post/submission。
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertUgcWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";
import { uploadChatImage, ChatImageError } from "@/server/ai/chat-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertUgcWriteEnabled();
    await enforceRateLimit("chat:image", user.appUser.id, RATE_LIMITS.chatImage);

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "仅支持 JPEG、PNG 和 WebP" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadChatImage({
      ownerUserId: user.appUser.id,
      bytes,
      declaredMime: file.type
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const feature = featureErrorResponse(error);
    if (feature) return feature;
    const rateLimit = rateLimitErrorResponse(error);
    if (rateLimit) return rateLimit;
    if (error instanceof ChatImageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("chat image upload failed", {
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "图片上传失败" }, { status: 500 });
  }
}
