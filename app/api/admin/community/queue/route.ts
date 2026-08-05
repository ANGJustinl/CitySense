import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { communityErrorResponse } from "@/server/community/errors";
import { listCommunityModerationQueue } from "@/server/community/moderation";

export async function GET() {
  try { await requireAdmin(); return NextResponse.json(await listCommunityModerationQueue()); }
  catch (error) { return authErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Moderation queue failed" }, { status: 500 }); }
}
