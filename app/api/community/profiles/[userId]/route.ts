import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { assertCommunityReadEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { getCommunityProfile } from "@/server/community/feed";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertCommunityReadEnabled();
    const viewer = await getOptionalUser();
    const { userId } = await context.params;
    return NextResponse.json(await getCommunityProfile(userId, viewer?.appUser.id));
  } catch (error) {
    return featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
}
