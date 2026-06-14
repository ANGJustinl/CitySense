import {
  processPendingRawSourceItems,
  type NormalizePendingRawSourceItemsInput
} from "@/server/ingest/pipeline";
import { prisma } from "@/server/db/prisma";

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function runNormalizeWorker(input: NormalizePendingRawSourceItemsInput = {}) {
  return processPendingRawSourceItems(input);
}

export async function runNormalizeWorkerFromEnv() {
  const result = await runNormalizeWorker({
    source: process.env.NORMALIZE_WORKER_SOURCE?.trim() || undefined,
    ingestRunId: process.env.NORMALIZE_WORKER_INGEST_RUN_ID?.trim() || undefined,
    limit: numberFromEnv("NORMALIZE_WORKER_LIMIT", 50)
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1]?.endsWith("normalize-worker.ts")) {
  runNormalizeWorkerFromEnv()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
