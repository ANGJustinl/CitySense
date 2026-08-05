import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { listNotifications, markNotificationsRead } from "@/server/buddy/notifications";
export async function GET() { try { const user = await requireUser(); return NextResponse.json(await listNotifications(user.appUser.id)); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Notifications failed" }, { status: 500 }); } }
export async function POST(request: Request) { try { const user = await requireUser(); const body = await request.json(); return NextResponse.json(await markNotificationsRead(user.appUser.id, Array.isArray(body.ids) ? body.ids : undefined)); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Notification update failed" }, { status: 500 }); } }
