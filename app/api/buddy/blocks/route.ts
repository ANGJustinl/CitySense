import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { buddyErrorResponse } from "@/server/buddy/http";
import { blockBuddyUser, listBuddyBlocks } from "@/server/buddy/safety";
export async function GET() { try { const user = await requireUser(); return NextResponse.json({ blocks: await listBuddyBlocks(user.appUser.id) }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Blocks failed" }, { status: 500 }); } }
export async function POST(request: Request) { try { const user = await requireUser(); return NextResponse.json({ block: await blockBuddyUser(user.appUser.id, await request.json()) }, { status: 201 }); } catch (error) { return buddyErrorResponse(error) ?? NextResponse.json({ error: "Block failed" }, { status: 500 }); } }
