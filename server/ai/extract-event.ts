import type { RawSourceItem, RawSourceItemDetail } from "@/server/sources/source.types";
import { parseRawSourceItem } from "@/server/sources/crawler/parser";

export async function extractEventFromRawItem(item: RawSourceItem): Promise<RawSourceItemDetail> {
  return parseRawSourceItem(item);
}
