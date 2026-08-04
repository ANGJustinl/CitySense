import { Queue } from "bullmq";
import IORedis from "ioredis";

const QUEUE = "citysense-place-submissions";
let queue: Queue | undefined;

export function isSubmissionQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function getSubmissionQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!queue) {
    const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE, { connection });
  }
  return queue;
}

export async function enqueueSubmissionReview(id: string, version: number) {
  const value = getSubmissionQueue();
  if (!value) throw new Error("REDIS_URL is not configured");
  return value.add("review", { id, version }, { jobId: `${id}:v${version}`, attempts: 3, backoff: { type: "exponential", delay: 2000 } });
}

export const submissionQueueName = QUEUE;
