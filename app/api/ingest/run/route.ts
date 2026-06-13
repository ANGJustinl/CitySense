import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { enqueueIngestRun, isIngestQueueConfigured, resolveIngestSources } from "@/server/ingest/queue";
import { ingestRunRequestSchema } from "@/server/ingest/types";
import { getSourceAdapters } from "@/server/sources/source-registry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = ingestRunRequestSchema.parse(body);
    const knownSources = new Set(getSourceAdapters().map((adapter) => adapter.source));
    const unknownSources = input.sources?.filter((source) => !knownSources.has(source)) ?? [];

    if (unknownSources.length > 0) {
      return NextResponse.json(
        {
          error: "Unknown sources",
          sources: unknownSources
        },
        { status: 400 }
      );
    }

    if (!isIngestQueueConfigured()) {
      return NextResponse.json(
        {
          error: "REDIS_URL is not configured"
        },
        { status: 503 }
      );
    }

    const result = await enqueueIngestRun({
      ...input,
      sources: resolveIngestSources(input.sources)
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid ingest run request",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue ingest run"
      },
      { status: 503 }
    );
  }
}
