import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/server/db/prisma";
import { sourceAdapters } from "@/server/sources/source-registry";
import type { IngestRunRequest } from "@/server/ingest/types";

export const INGEST_QUEUE_NAME = "ingest";
export const INGEST_QUEUE_PREFIX = "citysense";
export const INGEST_JOB_NAME = "ingest.run";

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

export function resolveIngestSources(sources?: string[]) {
  const known = new Set(sourceAdapters.map((adapter) => adapter.source));

  if (!sources?.length) {
    return [...known];
  }

  return [...new Set(sources)].filter((source) => known.has(source));
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
        attempts: 1,
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
