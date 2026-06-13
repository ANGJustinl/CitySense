import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const feedback = await request.json();

  return NextResponse.json({
    ok: true,
    receivedAt: new Date().toISOString(),
    feedback
  });
}
