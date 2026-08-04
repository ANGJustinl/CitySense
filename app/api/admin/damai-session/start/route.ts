import { NextResponse } from "next/server";
import { startDamaiVerificationSession } from "@/server/sources/plugins/damai-session";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const result = await startDamaiVerificationSession({ city: (body as { city?: unknown }).city, keyword: (body as { keyword?: unknown }).keyword });
    return NextResponse.json(result, { status: result.status === "ok" ? 200 : 502 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Damai session failed" }, { status: 500 });
  }
}
