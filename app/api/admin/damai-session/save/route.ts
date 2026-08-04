import { NextResponse } from "next/server";
import { saveDamaiVerificationCookies } from "@/server/sources/plugins/damai-session";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const result = await saveDamaiVerificationCookies({ city: (body as { city?: unknown }).city, keyword: (body as { keyword?: unknown }).keyword });
    const status = result.status === "ok" ? 200 : result.status === "not_started" || result.status === "invalid_payload" ? 400 : result.status === "requires_verification" ? 409 : 502;
    return NextResponse.json(result, { status });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Damai cookie save failed" }, { status: 500 });
  }
}
