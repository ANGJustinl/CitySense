import { NextResponse } from "next/server";
import { getXiaohongshuLoginQrcode } from "@/server/sources/mcp/xiaohongshu-login";

export const runtime = "nodejs";

export async function POST() {
  const result = await getXiaohongshuLoginQrcode();
  const statusCode = result.status === "ok" ? 200 : result.status === "not_configured" ? 503 : 502;

  return NextResponse.json(result, { status: statusCode });
}
