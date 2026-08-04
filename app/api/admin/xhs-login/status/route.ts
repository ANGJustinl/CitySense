import { NextResponse } from "next/server";
import { getXiaohongshuLoginStatus } from "@/server/sources/mcp/xiaohongshu-login";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ ...(await getXiaohongshuLoginStatus()), checkedAt: new Date().toISOString() });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "XHS status failed" }, { status: 500 });
  }
}
