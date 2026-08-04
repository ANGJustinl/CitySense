import { Worker } from "bullmq";
import {
  createRedisConnection,
  INGEST_QUEUE_NAME,
  INGEST_QUEUE_PREFIX
} from "@/server/ingest/queue";
import { executeIngestRun } from "@/server/ingest/pipeline";
import { prisma } from "@/server/db/prisma";

export async function runIngestWorker(runId: string) {
  return executeIngestRun(runId);
}

export function startIngestWorker() {
  const concurrency = Number(process.env.INGEST_WORKER_CONCURRENCY ?? "1");
  const worker = new Worker(
    INGEST_QUEUE_NAME,
    async (job) => {
      const runId = job.data?.runId;

      if (typeof runId !== "string") {
        throw new Error("Missing ingest run id");
      }

      return runIngestWorker(runId);
    },
    {
      connection: createRedisConnection(),
      prefix: INGEST_QUEUE_PREFIX,
      concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 1
    }
  );

  worker.on("completed", (job) => {
    console.log(`ingest job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`ingest job failed: ${job?.id}`, error);
    void markIngestRunFailed(job?.data?.runId, error);
  });

  return worker;
}

async function markIngestRunFailed(runId: unknown, error: Error) {
  if (typeof runId !== "string") {
    return;
  }

  try {
    await prisma.ingestRun.updateMany({
      where: {
        id: runId,
        status: {
          in: ["queued", "running"]
        }
      },
      data: {
        status: "failed",
        error: error.message,
        finishedAt: new Date()
      }
    });
  } catch (markError) {
    console.error(`failed to mark ingest run failed: ${runId}`, markError);
  }
}

if (process.argv[1]?.endsWith("ingest-worker.ts")) {
  startIngestWorker();
}
