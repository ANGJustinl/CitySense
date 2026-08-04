import { Worker } from "bullmq";
import IORedis from "ioredis";
import { submissionQueueName } from "@/server/submissions/queue";
import { processSubmission } from "@/server/submissions/process";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(
  submissionQueueName,
  async (job) => processSubmission(job.data.id as string),
  { connection, concurrency: 2 }
);
worker.on("failed", (job, error) => console.error("submission review failed", job?.id, error.message));
console.log("CitySense submission review worker started");
