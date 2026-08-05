import { NextResponse } from "next/server";
import { getOptionalUser, requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityReadEnabled, assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { getCommunityPost } from "@/server/community/feed";
import { deleteCommunityPost, updateCommunityPost } from "@/server/community/posts";
import { communityPost } from "@/server/community/visibility";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommunityReadEnabled();
    const viewer = await getOptionalUser();
    const { id } = await context.params;
    return NextResponse.json(await getCommunityPost(id, viewer?.appUser.id));
  } catch (error) {
    return featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    return NextResponse.json(communityPost(await updateCommunityPost(user.appUser.id, id, await request.json()), user.appUser.id));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Post update failed" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    return NextResponse.json(await deleteCommunityPost(user.appUser.id, id));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Post deletion failed" }, { status: 400 });
  }
}
