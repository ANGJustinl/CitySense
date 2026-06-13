import type { CandidateType } from "@/server/recommendation/types";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

export type NormalizedEntityInput = {
  sourceKey: string;
  entityType: CandidateType;
  title: string;
  description?: string;
  city: string;
  area?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startTime?: Date;
  endTime?: Date;
  tags: string[];
  source: string;
  sourceUrl?: string;
  trendScore: number;
  confidence: number;
  priceLevel?: number;
  quietness?: number;
  popularity?: number;
};

function parseDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toNormalizedEntityInput(
  item: RawSourceItemDetail,
  sourceKey: string
): NormalizedEntityInput | null {
  const title = item.title.trim();

  if (!title || !item.city) {
    return null;
  }

  return {
    sourceKey,
    entityType: item.itemType,
    title,
    description: item.content,
    city: item.city,
    area: item.area,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    startTime: parseDate(item.startsAt),
    endTime: parseDate(item.endsAt),
    tags: item.tags,
    source: item.source,
    sourceUrl: item.sourceUrl,
    trendScore: item.trendScore ?? 0,
    confidence: item.confidence ?? 60,
    priceLevel: item.priceLevel,
    quietness: item.quietness,
    popularity: item.popularity
  };
}

export function buildCitySignalRows(
  item: RawSourceItemDetail,
  sourceKey: string,
  normalizedEntityId: string
) {
  const capturedAt = new Date();
  const heatScore = item.trendScore ?? item.sourceSignals?.[0]?.score ?? 0;

  return item.tags.map((tag) => ({
    city: item.city ?? "上海",
    area: item.area,
    tag,
    heatScore,
    source: item.source,
    capturedAt,
    metadata: {
      sourceKey,
      normalizedEntityId,
      itemType: item.itemType,
      title: item.title,
      sourceSignals: item.sourceSignals ?? []
    }
  }));
}
