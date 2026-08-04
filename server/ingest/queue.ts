import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/server/db/prisma";
import { getSourceAdapters } from "@/server/sources/source-registry";
import type { IngestRunRequest } from "@/server/ingest/types";

export const INGEST_QUEUE_NAME = "ingest";
export const NORMALIZE_QUEUE_NAME = "normalize";
export const INGEST_QUEUE_PREFIX = "citysense";
export const INGEST_JOB_NAME = "ingest.run";
export const NORMALIZE_JOB_NAME = "ingest.normalize";

export type NormalizeJobPayload = {
  source?: string;
  ingestRunId?: string;
  limit?: number;
};

export function isIngestQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function createRedisConnection() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  return new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
  });
}

export function createIngestQueue() {
  return new Queue(INGEST_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: INGEST_QUEUE_PREFIX
  });
}

export function createNormalizeQueue() {
  return new Queue<NormalizeJobPayload>(NORMALIZE_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: INGEST_QUEUE_PREFIX
  });
}

export function resolveIngestSources(sources?: string[]) {
  const known = new Set(getSourceAdapters().map((adapter) => adapter.source));

  if (!sources?.length) {
    return [...known];
  }

  return [...new Set(sources)].filter((source) => known.has(source));
}

export async function enqueueNormalizeJob(input: NormalizeJobPayload) {
  if (!isIngestQueueConfigured()) {
    throw new Error("REDIS_URL is not configured");
  }

  const queue = createNormalizeQueue();
  const sourceKey = input.source ?? "all";
  const runKey = input.ingestRunId ?? "global";
  const limit = input.limit;
  const jobId = `normalize-${runKey}-${sourceKey}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  try {
    const job = await queue.add(
      NORMALIZE_JOB_NAME,
      input,
      {
        jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10_000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    );

    return {
      jobId: String(job.id),
      source: input.source,
      ingestRunId: input.ingestRunId,
      limit
    };
  } finally {
    await queue.close();
  }
}

export async function enqueueIngestRun(input: IngestRunRequest) {
  if (!isIngestQueueConfigured()) {
    throw new Error("REDIS_URL is not configured");
  }

  const sources = resolveIngestSources(input.sources);
  const run = await prisma.ingestRun.create({
    data: {
      city: input.city,
      area: input.area,
      keywords: input.keywords,
      sources,
      status: "queued",
      requestedBy: input.requestedBy,
      force: input.force
    }
  });
  const queue = createIngestQueue();

  try {
    await queue.add(
      INGEST_JOB_NAME,
      {
        runId: run.id
      },
      {
        jobId: `ingest-${run.id}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10_000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    );
  } catch (error) {
    await prisma.ingestRun.update({
      where: {
        id: run.id
      },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "queue add failed",
        finishedAt: new Date()
      }
    });
    throw error;
  } finally {
    await queue.close();
  }

  return {
    runId: run.id,
    status: "queued" as const,
    sources,
    queuedAt: run.createdAt.toISOString()
  };
}
