import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { reportBuddy } from "@/server/buddy/safety";
export async function POST(request: Request) { try { const user = await requireUser(); return NextResponse.json({ report: await reportBuddy(user.appUser.id, await request.json(), request.headers.get("idempotency-key") ?? undefined) }, { status: 201 }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Report failed" }, { status: 500 }); } }
