import { NextResponse } from "next/server";
import { startDamaiVerificationSession } from "@/server/sources/plugins/damai-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await startDamaiVerificationSession({
    city: (body as { city?: unknown }).city,
    keyword: (body as { keyword?: unknown }).keyword
  });
  const statusCode = result.status === "ok" ? 200 : 502;

  return NextResponse.json(result, { status: statusCode });
}
