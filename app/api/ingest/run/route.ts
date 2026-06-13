import { NextResponse } from "next/server";
import { runIngestWorker } from "@/workers/ingest-worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await runIngestWorker({
    city: typeof body.city === "string" ? body.city : "上海",
    keywords: Array.isArray(body.keywords) ? body.keywords : ["咖啡", "展览"]
  });

  return NextResponse.json({
    ...result,
    ranAt: new Date().toISOString()
  });
}
