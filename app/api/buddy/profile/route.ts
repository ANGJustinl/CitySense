import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { getBuddyProfile, saveBuddyProfile } from "@/server/buddy/service";

export async function GET() {
  try { const user = await requireUser(); return NextResponse.json({ profile: await getBuddyProfile(user.appUser.id) }); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Profile failed" }, { status: 500 }); }
}
export async function PUT(request: Request) {
  try { const user = await requireUser(); return NextResponse.json({ profile: await saveBuddyProfile(user.appUser.id, await request.json()) }); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Profile update failed" }, { status: 500 }); }
}
