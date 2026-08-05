import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { listCommunityFeed } from "@/server/community/feed";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertCommunityReadEnabled();
    const viewer = await getOptionalUser();
    const { userId } = await context.params;
    const url = new URL(request.url);
    return NextResponse.json(await listCommunityFeed({ city: "上海", scope: "city", authorId: userId, viewerId: viewer?.appUser.id, cursor: url.searchParams.get("cursor") ?? undefined, limit: 20 }));
  } catch (error) {
    return featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Profile posts failed" }, { status: 400 });
  }
}
