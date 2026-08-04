import { Queue } from "bullmq";
import { createRedisConnection, INGEST_QUEUE_PREFIX } from "@/server/ingest/queue";
import type { CityStateRefreshInput } from "@/server/city-state/types";

export const CITY_STATE_REFRESH_QUEUE_NAME = "city-state-refresh";
export const CITY_STATE_REFRESH_JOB_NAME = "city-state.refresh";

export function isCityStateRefreshQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function createCityStateRefreshQueue() {
  return new Queue(CITY_STATE_REFRESH_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: INGEST_QUEUE_PREFIX
  });
}

function jobIdFor(input: CityStateRefreshInput) {
  const scope = [input.city, input.area ?? "city"].map(encodeURIComponent).join("--");
  const suffix = input.force ? Date.now().toString() : "latest";

  return `city-state--${scope}--${suffix}`;
}

export async function enqueueCityStateRefresh(input: CityStateRefreshInput) {
  if (!isCityStateRefreshQueueConfigured()) {
    throw new Error("REDIS_URL is not configured");
  }

  const queue = createCityStateRefreshQueue();

  try {
    const job = await queue.add(CITY_STATE_REFRESH_JOB_NAME, input, {
      jobId: jobIdFor(input),
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100
    });

    return {
      jobId: String(job.id),
      status: "queued" as const,
      city: input.city,
      area: input.area,
      queuedAt: new Date().toISOString()
    };
  } finally {
    await queue.close();
  }
}

export const __testing = {
  jobIdFor
};
