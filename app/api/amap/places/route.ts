import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { searchAmapPlaces } from "@/server/maps/amap-place-search";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    const city = (url.searchParams.get("city") ?? "上海").trim();
    if (query.length < 2 || query.length > 60) return NextResponse.json({ error: "query must be 2-60 characters" }, { status: 400 });
    return NextResponse.json({ places: await searchAmapPlaces({ city, query, limit: 8 }) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Place search failed" }, { status: 500 });
  }
}
