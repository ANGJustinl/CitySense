import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { createBuddyIntent, listBuddyIntents } from "@/server/buddy/service";

export async function GET(request: Request) {
  try { const user = await requireUser(); const routeId = new URL(request.url).searchParams.get("routeId") ?? undefined; return NextResponse.json(await listBuddyIntents(user.appUser.id, routeId)); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Intent list failed" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(); const result = await createBuddyIntent(user.appUser.id, await request.json(), request.headers.get("idempotency-key") ?? undefined); return NextResponse.json(result, { status: 201 }); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Intent creation failed" }, { status: 500 }); }
}
