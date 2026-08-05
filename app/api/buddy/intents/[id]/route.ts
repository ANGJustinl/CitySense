import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { getBuddyIntent } from "@/server/buddy/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const [user, { id }] = await Promise.all([requireUser(), params]); return NextResponse.json(await getBuddyIntent(user.appUser.id, id)); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Intent failed" }, { status: 500 }); }
}
