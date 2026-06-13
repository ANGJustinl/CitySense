import { normalizeRawSourceItem } from "@/server/sources/crawler/normalizer";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

export async function runNormalizeWorker(items: RawSourceItemDetail[]) {
  return items.map(normalizeRawSourceItem);
}
