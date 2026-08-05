import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { searchPublishedVenues } from "@/server/community/venues";

export async function GET(request: Request) {
  try {
    assertCommunityReadEnabled();
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    const city = (url.searchParams.get("city") ?? "").trim();
    if (query.length < 1 || query.length > 60) {
      return NextResponse.json({ error: "query must be 1-60 characters" }, { status: 400 });
    }
    // 鉴权：搜索本身允许匿名（读公开地点），但记录 viewer 以保持一致性
    await getOptionalUser();
    const venues = await searchPublishedVenues({ query, city: city || undefined, limit: 8 });
    return NextResponse.json({ venues });
  } catch (error) {
    return authErrorResponse(error)
      ?? featureErrorResponse(error)
      ?? communityErrorResponse(error)
      ?? NextResponse.json({ error: "Venue search failed" }, { status: 500 });
  }
}
