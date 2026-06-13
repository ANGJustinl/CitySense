import { NextResponse } from "next/server";
import { getIngestStatus } from "@/server/ingest/status";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? undefined;

  return NextResponse.json({
    ...(await getIngestStatus(runId)),
    checkedAt: new Date().toISOString()
  });
}
