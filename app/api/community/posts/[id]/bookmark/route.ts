import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { setPostBookmark } from "@/server/community/interactions";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";

async function update(context: { params: Promise<{ id: string }> }, enabled: boolean) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    await enforceRateLimit("community:reaction", user.appUser.id, RATE_LIMITS.communityReaction);
    return NextResponse.json(await setPostBookmark(user.appUser.id, id, enabled));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? rateLimitErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Bookmark update failed" }, { status: 400 });
  }
}
export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) { return update(context, true); }
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) { return update(context, false); }
