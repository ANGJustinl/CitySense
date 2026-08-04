import { NextResponse } from "next/server";
import { getXiaohongshuLoginQrcode } from "@/server/sources/mcp/xiaohongshu-login";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function POST() {
  try {
    await requireAdmin();
    const result = await getXiaohongshuLoginQrcode();
    return NextResponse.json(result, { status: result.status === "ok" ? 200 : result.status === "not_configured" ? 503 : 502 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "XHS login failed" }, { status: 500 });
  }
}
