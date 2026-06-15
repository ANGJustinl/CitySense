import { z } from "zod";

export const ingestRunRequestSchema = z.object({
  city: z.string().min(1),
  area: z.string().optional(),
  keywords: z.array(z.string().min(1)).min(1),
  sources: z.array(z.string().min(1)).optional(),
  force: z.boolean().default(false),
  requestedBy: z.string().optional()
});

export type IngestRunRequest = z.infer<typeof ingestRunRequestSchema>;

export type IngestRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial_failed"
  | "failed";

export type IngestStats = {
  sourcesRequested: number;
  sourcesCompleted: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  fetched: number;
  preFiltered: number;  // 预过滤总数
  rawUpserted: number;
  normalized: number;
  citySignalsCreated: number;
  errors: string[];
};

export type SourceIngestResult = {
  source: string;
  status: "completed" | "skipped" | "failed";
  fetched: number;
  rawUpserted: number;
  normalized: number;
  citySignalsCreated: number;
  preFilteredCount?: number;  // 预过滤掉的低质量标题数量
  error?: string;
};

export function createEmptyIngestStats(sourcesRequested: number): IngestStats {
  return {
    sourcesRequested,
    sourcesCompleted: 0,
    sourcesSkipped: 0,
    sourcesFailed: 0,
    fetched: 0,
    preFiltered: 0,
    rawUpserted: 0,
    normalized: 0,
    citySignalsCreated: 0,
    errors: []
  };
}

export function applySourceResult(stats: IngestStats, result: SourceIngestResult): IngestStats {
  return {
    sourcesRequested: stats.sourcesRequested,
    sourcesCompleted:
      stats.sourcesCompleted + (result.status === "completed" ? 1 : 0),
    sourcesSkipped: stats.sourcesSkipped + (result.status === "skipped" ? 1 : 0),
    sourcesFailed: stats.sourcesFailed + (result.status === "failed" ? 1 : 0),
    fetched: stats.fetched + result.fetched,
    preFiltered: stats.preFiltered + (result.preFilteredCount || 0),
    rawUpserted: stats.rawUpserted + result.rawUpserted,
    normalized: stats.normalized + result.normalized,
    citySignalsCreated: stats.citySignalsCreated + result.citySignalsCreated,
    errors: result.error ? [...stats.errors, `${result.source}: ${result.error}`] : stats.errors
  };
}
