import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { unblockBuddyUser } from "@/server/buddy/safety";
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) { try { const [user, { userId }] = await Promise.all([requireUser(), params]); return NextResponse.json(await unblockBuddyUser(user.appUser.id, userId)); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Unblock failed" }, { status: 500 }); } }
