import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isUgcEnabled } from "@/server/config/ugc";
import { listUserMapVenues, userMapVenueQuerySchema } from "@/server/venues/user-map-places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isUgcEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = new URL(request.url);
    const query = userMapVenueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const response = NextResponse.json(await listUserMapVenues(query));
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return response;
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid map query", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: "User venues unavailable" }, { status: 500 });
  }
}
