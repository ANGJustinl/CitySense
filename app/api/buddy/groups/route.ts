import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { listBuddyGroups } from "@/server/buddy/messages";

export async function GET() { try { const user = await requireUser(); return NextResponse.json({ groups: await listBuddyGroups(user.appUser.id) }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Groups failed" }, { status: 500 }); } }
