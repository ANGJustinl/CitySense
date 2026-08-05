import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { communityErrorResponse } from "@/server/community/errors";
import { decideCommunityReport } from "@/server/community/moderation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireAdmin(); const { id } = await context.params; return NextResponse.json(await decideCommunityReport({ actorUserId: user.appUser.id, actorType: user.appUser.role as "ADMIN"|"MODERATOR", reportId: id, payload: await request.json() })); }
  catch (error) { return authErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Decision failed" }, { status: 400 }); }
}
