import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { listCommunityFeed } from "@/server/community/feed";
import { feedQuerySchema } from "@/server/community/schema";

export async function GET(request: Request) {
  try {
    assertCommunityReadEnabled();
    const url = new URL(request.url);
    const query = feedQuerySchema.parse(Object.fromEntries(url.searchParams));
    const viewer = await getOptionalUser();
    return NextResponse.json(await listCommunityFeed({ ...query, viewerId: viewer?.appUser.id }));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Feed failed" }, { status: 400 });
  }
}
