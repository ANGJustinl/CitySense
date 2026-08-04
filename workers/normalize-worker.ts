import { Worker } from "bullmq";
import {
  processPendingRawSourceItems,
  type NormalizePendingRawSourceItemsInput
} from "@/server/ingest/pipeline";
import { prisma } from "@/server/db/prisma";
import {
  createRedisConnection,
  enqueueNormalizeJob,
  INGEST_QUEUE_PREFIX,
  NORMALIZE_QUEUE_NAME,
  type NormalizeJobPayload
} from "@/server/ingest/queue";

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function runNormalizeWorker(input: NormalizePendingRawSourceItemsInput = {}) {
  return processPendingRawSourceItems(input);
}

function shouldRunOnceFromEnv() {
  return (
    process.env.NORMALIZE_WORKER_ONCE === "true" ||
    Boolean(process.env.NORMALIZE_WORKER_SOURCE?.trim()) ||
    Boolean(process.env.NORMALIZE_WORKER_INGEST_RUN_ID?.trim())
  );
}

function concurrencyFromEnv() {
  const value = Number(process.env.NORMALIZE_WORKER_CONCURRENCY ?? "1");

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function startNormalizeQueueWorker() {
  const worker = new Worker<NormalizeJobPayload>(
    NORMALIZE_QUEUE_NAME,
    async (job) => {
      const limit = typeof job.data.limit === "number" && job.data.limit > 0
        ? Math.floor(job.data.limit)
        : numberFromEnv("NORMALIZE_WORKER_LIMIT", 20);
      const result = await processPendingRawSourceItems({
        source: job.data.source,
        ingestRunId: job.data.ingestRunId,
        limit,
        itemConcurrency: numberFromEnv("NORMALIZE_WORKER_ITEM_CONCURRENCY", 1)
      });

      if (result.scanned >= limit) {
        await enqueueNormalizeJob({
          source: job.data.source,
          ingestRunId: job.data.ingestRunId,
          limit
        });
      }

      return result;
    },
    {
      connection: createRedisConnection(),
      prefix: INGEST_QUEUE_PREFIX,
      concurrency: concurrencyFromEnv()
    }
  );

  worker.on("completed", (job) => {
    console.log(`normalize job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`normalize job failed: ${job?.id}`, error);
  });

  return worker;
}

export async function runNormalizeWorkerFromEnv() {
  const result = await runNormalizeWorker({
    source: process.env.NORMALIZE_WORKER_SOURCE?.trim() || undefined,
    ingestRunId: process.env.NORMALIZE_WORKER_INGEST_RUN_ID?.trim() || undefined,
    limit: numberFromEnv("NORMALIZE_WORKER_LIMIT", 50),
    itemConcurrency: numberFromEnv("NORMALIZE_WORKER_ITEM_CONCURRENCY", 1)
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1]?.endsWith("normalize-worker.ts")) {
  if (shouldRunOnceFromEnv()) {
    runNormalizeWorkerFromEnv()
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(async () => {
        await prisma.$disconnect();
      });
  } else {
    startNormalizeQueueWorker();
  }
}
