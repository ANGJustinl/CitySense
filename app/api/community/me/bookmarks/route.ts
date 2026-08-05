import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { listBookmarks } from "@/server/community/feed";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertCommunityReadEnabled();
    const url = new URL(request.url);
    return NextResponse.json(await listBookmarks(user.appUser.id, url.searchParams.get("cursor") ?? undefined));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Bookmarks failed" }, { status: 400 });
  }
}
