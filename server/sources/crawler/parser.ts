import type { RawSourceItem, RawSourceItemDetail } from "@/server/sources/source.types";

export function parseRawSourceItem(item: RawSourceItem): RawSourceItemDetail {
  return {
    ...item,
    status: "normalized",
    tags: [],
    trendScore: 0,
    confidence: 0,
    popularity: 0,
    quietness: 50,
    priceLevel: 2,
    sourceSignals: []
  };
}
