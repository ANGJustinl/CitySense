import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { deleteCommunityComment } from "@/server/community/comments";
import { communityErrorResponse } from "@/server/community/errors";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    return NextResponse.json(await deleteCommunityComment(user.appUser.id, id));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Comment deletion failed" }, { status: 400 });
  }
}
