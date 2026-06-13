import { NextResponse } from "next/server";
import { resolveTrafficInfo } from "@/server/maps/traffic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const traffic = await resolveTrafficInfo({
    city: typeof body.city === "string" ? body.city : "上海",
    origin: body.origin,
    destination: body.destination,
    mode: body.mode ?? "transit",
    useRealtimeTraffic: true
  });

  return NextResponse.json({
    traffic
  });
}
