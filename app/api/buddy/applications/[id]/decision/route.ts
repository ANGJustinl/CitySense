import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { decideBuddyApplication } from "@/server/buddy/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const [user, { id }, body] = await Promise.all([requireUser(), params, request.json()]); return NextResponse.json(await decideBuddyApplication(user.appUser.id, id, body)); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Decision failed" }, { status: 500 }); }
}
