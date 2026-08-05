import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { applyToBuddyIntent } from "@/server/buddy/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const [user, { id }, body] = await Promise.all([requireUser(), params, request.json()]); return NextResponse.json(await applyToBuddyIntent(user.appUser.id, id, body), { status: 201 }); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Application failed" }, { status: 500 }); }
}
