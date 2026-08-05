import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { retryAutoMatch } from "@/server/buddy/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const [user, { id }] = await Promise.all([requireUser(), params]); return NextResponse.json(await retryAutoMatch(user.appUser.id, id)); }
  catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Match failed" }, { status: 500 }); }
}
