import { NextResponse } from "next/server";
import { getXiaohongshuLoginStatus } from "@/server/sources/mcp/xiaohongshu-login";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...(await getXiaohongshuLoginStatus()),
    checkedAt: new Date().toISOString()
  });
}
