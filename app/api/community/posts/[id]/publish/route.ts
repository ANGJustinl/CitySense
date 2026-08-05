import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { publishCommunityPost } from "@/server/community/posts";
import { communityPost } from "@/server/community/visibility";

const schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return NextResponse.json(communityPost(await publishCommunityPost(user.appUser.id, id, input.expectedVersion), user.appUser.id));
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Post publish failed" }, { status: 400 });
  }
}
