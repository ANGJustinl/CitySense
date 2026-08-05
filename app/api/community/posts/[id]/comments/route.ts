import { NextResponse } from "next/server";
import { getOptionalUser, requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { createCommunityComment, listCommunityComments } from "@/server/community/comments";
import { communityErrorResponse } from "@/server/community/errors";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommunityReadEnabled();
    await getOptionalUser();
    const { id } = await context.params;
    const url = new URL(request.url);
    return NextResponse.json(await listCommunityComments(id, url.searchParams.get("cursor") ?? undefined));
  } catch (error) {
    return featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Comments failed" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    await enforceRateLimit(`community:comment:${id}`, user.appUser.id, RATE_LIMITS.communityComment);
    return NextResponse.json(await createCommunityComment({ postId: id, authorId: user.appUser.id, idempotencyKey: request.headers.get("idempotency-key") ?? undefined, payload: await request.json() }), { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? rateLimitErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Comment creation failed" }, { status: 400 });
  }
}
