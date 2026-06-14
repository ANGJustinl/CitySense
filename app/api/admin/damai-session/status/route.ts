import { NextResponse } from "next/server";
import { getDamaiSessionStatus } from "@/server/sources/plugins/damai-session";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getDamaiSessionStatus());
}
