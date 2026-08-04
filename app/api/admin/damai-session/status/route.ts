import { NextResponse } from "next/server";
import { getDamaiSessionStatus } from "@/server/sources/plugins/damai-session";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getDamaiSessionStatus());
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Damai status failed" }, { status: 500 });
  }
}
