import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { createCommunityPost } from "@/server/community/posts";
import { communityPost } from "@/server/community/visibility";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    await enforceRateLimit("community:post", user.appUser.id, RATE_LIMITS.communityPost);
    const post = await createCommunityPost({ authorId: user.appUser.id, idempotencyKey: request.headers.get("idempotency-key") ?? undefined, payload: await request.json() });
    return NextResponse.json(communityPost(post, user.appUser.id), { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? rateLimitErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Post creation failed" }, { status: 400 });
  }
}
