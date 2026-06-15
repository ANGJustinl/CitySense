import { NextResponse } from "next/server";
import { getHeatPoints, type HeatMode } from "@/server/recommendation/heat-points";

export const runtime = "nodejs";

const VALID_MODES: HeatMode[] = ["pulse", "trend", "quiet", "match"];

function parseInterests(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "上海";
  const area = url.searchParams.get("area") || undefined;
  const modeParam = url.searchParams.get("mode") || "pulse";
  const mode: HeatMode = VALID_MODES.includes(modeParam as HeatMode)
    ? (modeParam as HeatMode)
    : "pulse";

  const result = await getHeatPoints({
    city,
    area,
    mode,
    interests: parseInterests(url.searchParams.get("interests")),
    mood: (url.searchParams.get("mood") as never) ?? undefined,
    budget: (url.searchParams.get("budget") as never) ?? undefined
  });

  return NextResponse.json(result);
}
