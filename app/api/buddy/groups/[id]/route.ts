import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { getBuddyGroup } from "@/server/buddy/messages";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { const [user, { id }] = await Promise.all([requireUser(), params]); return NextResponse.json({ group: await getBuddyGroup(user.appUser.id, id) }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Group failed" }, { status: 500 }); } }
