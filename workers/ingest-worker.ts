import { collectSourceItems } from "@/server/sources/source-registry";

export async function runIngestWorker(input = { city: "上海", keywords: ["咖啡", "展览"] }) {
  const items = await collectSourceItems({
    city: input.city,
    keywords: input.keywords
  });

  return {
    collected: items.length,
    status: "completed" as const
  };
}
