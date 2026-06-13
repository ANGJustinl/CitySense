import type { Candidate } from "@/server/recommendation/types";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

export function normalizeRawSourceItem(item: RawSourceItemDetail): Candidate {
  const trendScore = item.trendScore ?? 0;

  return {
    id: item.id,
    name: item.title,
    type: item.itemType,
    description: item.content,
    city: item.city ?? "上海",
    area: item.area,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    tags: item.tags,
    source: item.source,
    sourceUrl: item.sourceUrl,
    trendScore,
    confidence: item.confidence ?? 60,
    freshnessScore: item.publishedAt ? 80 : 50,
    popularity: item.popularity ?? trendScore,
    quietness: item.quietness ?? 50,
    priceLevel: item.priceLevel ?? 2,
    sourceSignals: item.sourceSignals ?? [
      {
        source: item.source,
        label: "来源信号",
        score: trendScore
      }
    ]
  };
}
