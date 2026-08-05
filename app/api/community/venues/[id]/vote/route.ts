import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { createVenueVoteSchema } from "@/server/community/schema";
import { setVenueVote, removeVenueVote } from "@/server/community/votes";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    await enforceRateLimit("community:vote", user.appUser.id, RATE_LIMITS.venueVote);
    const payload = createVenueVoteSchema.parse(await request.json());
    return NextResponse.json(await setVenueVote(user.appUser.id, id, payload.type));
  } catch (error) {
    return authErrorResponse(error)
      ?? featureErrorResponse(error)
      ?? rateLimitErrorResponse(error)
      ?? communityErrorResponse(error)
      ?? NextResponse.json({ error: "Vote failed" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    await enforceRateLimit("community:vote", user.appUser.id, RATE_LIMITS.venueVote);
    return NextResponse.json(await removeVenueVote(user.appUser.id, id));
  } catch (error) {
    return authErrorResponse(error)
      ?? featureErrorResponse(error)
      ?? rateLimitErrorResponse(error)
      ?? communityErrorResponse(error)
      ?? NextResponse.json({ error: "Vote removal failed" }, { status: 400 });
  }
}
