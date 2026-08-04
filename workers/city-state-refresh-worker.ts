import { Worker } from "bullmq";
import { createRedisConnection, INGEST_QUEUE_PREFIX } from "@/server/ingest/queue";
import {
  CITY_STATE_REFRESH_JOB_NAME,
  CITY_STATE_REFRESH_QUEUE_NAME,
} from "@/server/city-state/queue";
import { refreshCityConditions } from "@/server/city-state/refresh";
import type { CityStateRefreshInput } from "@/server/city-state/types";

export async function runCityStateRefreshWorker(input: CityStateRefreshInput) {
  return refreshCityConditions(input);
}

export function startCityStateRefreshWorker() {
  const concurrency = Number(process.env.CITY_STATE_WORKER_CONCURRENCY ?? "1");
  const worker = new Worker<CityStateRefreshInput, unknown, typeof CITY_STATE_REFRESH_JOB_NAME>(
    CITY_STATE_REFRESH_QUEUE_NAME,
    async (job) => runCityStateRefreshWorker(job.data),
    {
      connection: createRedisConnection(),
      prefix: INGEST_QUEUE_PREFIX,
      concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 1
    }
  );

  worker.on("completed", (job) => {
    console.log(`city-state refresh job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`city-state refresh job failed: ${job?.id}`, error);
  });

  return worker;
}

if (process.argv[1]?.endsWith("city-state-refresh-worker.ts")) {
  startCityStateRefreshWorker();
}
