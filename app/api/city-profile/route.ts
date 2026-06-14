import { NextResponse } from "next/server";
import { getCityProfile } from "@/server/recommendation/city-profile";

export const runtime = "nodejs";

/**
 * GET /api/city-profile?city=上海&area=静安寺
 * Returns the xiaohongshu-driven city interest profile. Empty-but-200 on
 * sparse data (never 500s) so the UI can degrade gracefully.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "上海";
  const area = url.searchParams.get("area") || undefined;

  return NextResponse.json(await getCityProfile({ city, area }));
}
