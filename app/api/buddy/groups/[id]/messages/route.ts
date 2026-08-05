import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { listBuddyMessages, sendBuddyMessage } from "@/server/buddy/messages";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const [user, { id }] = await Promise.all([requireUser(), params]); const url = new URL(request.url); const afterValue = url.searchParams.get("after"); return NextResponse.json({ messages: await listBuddyMessages(user.appUser.id, id, afterValue ? new Date(afterValue) : undefined) }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Messages failed" }, { status: 500 }); } }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const [user, { id }, body] = await Promise.all([requireUser(), params, request.json()]); return NextResponse.json({ message: await sendBuddyMessage(user.appUser.id, id, body) }, { status: 201 }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Message failed" }, { status: 500 }); } }
