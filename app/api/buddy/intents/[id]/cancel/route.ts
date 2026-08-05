import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { cancelBuddyIntent } from "@/server/buddy/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const [user, { id }, body] = await Promise.all([requireUser(), params, request.json()]); return NextResponse.json(await cancelBuddyIntent(user.appUser.id, id, body)); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Cancel failed" }, { status: 500 }); }
}
