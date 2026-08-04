import { NextResponse } from "next/server";
import { submitXiaohongshuLoginVerificationCode } from "@/server/sources/mcp/xiaohongshu-login";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const result = await submitXiaohongshuLoginVerificationCode((body as { code?: unknown }).code);
    const status = result.status === "ok" || result.status === "not_logged_in" ? 200 : result.status === "invalid_payload" ? 400 : result.status === "not_configured" ? 503 : 502;
    return NextResponse.json(result, { status });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "XHS verification failed" }, { status: 500 });
  }
}
