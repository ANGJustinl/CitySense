import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { closeBuddyGroup } from "@/server/buddy/messages";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) { try { const [user, { id, action }, body] = await Promise.all([requireUser(), params, request.json()]); if (action !== "cancel" && action !== "leave" && action !== "complete") return NextResponse.json({ error: "Invalid action" }, { status: 400 }); return NextResponse.json(await closeBuddyGroup(user.appUser.id, id, action, Number(body.version))); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Group action failed" }, { status: 500 }); } }
