import { NextResponse } from "next/server";
import { getCityConditionStatus } from "@/server/city-state/snapshots";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "上海";
  const area = url.searchParams.get("area") || undefined;

  return NextResponse.json(await getCityConditionStatus({ city, area }));
}
