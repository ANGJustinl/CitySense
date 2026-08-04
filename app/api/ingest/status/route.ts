import { NextResponse } from "next/server";
import { getIngestStatus } from "@/server/ingest/status";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId") ?? undefined;
    return NextResponse.json({
      ...(await getIngestStatus(runId)),
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Ingest status failed" }, { status: 500 });
  }
}
