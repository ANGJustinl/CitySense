import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { listVenueRanking } from "@/server/community/votes";
import { rankingQuerySchema } from "@/server/community/schema";

export async function GET(request: Request) {
  try {
    assertCommunityReadEnabled();
    const url = new URL(request.url);
    const query = rankingQuerySchema.parse(Object.fromEntries(url.searchParams));
    const viewer = await getOptionalUser();
    return NextResponse.json(await listVenueRanking({ ...query, viewerId: viewer?.appUser.id }));
  } catch (error) {
    return authErrorResponse(error)
      ?? featureErrorResponse(error)
      ?? communityErrorResponse(error)
      ?? NextResponse.json({ error: "Ranking failed" }, { status: 400 });
  }
}
