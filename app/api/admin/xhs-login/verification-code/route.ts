import { NextResponse } from "next/server";
import { submitXiaohongshuLoginVerificationCode } from "@/server/sources/mcp/xiaohongshu-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await submitXiaohongshuLoginVerificationCode((body as { code?: unknown }).code);
  const statusCode =
    result.status === "ok" || result.status === "not_logged_in"
      ? 200
      : result.status === "invalid_payload"
        ? 400
        : result.status === "not_configured"
          ? 503
          : 502;

  return NextResponse.json(result, { status: statusCode });
}
