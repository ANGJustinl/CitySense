import type { CandidateType } from "@/server/recommendation/types";
import type { RawSourceItemDetail } from "@/server/sources/source.types";
import { canonicalizeArea } from "@/server/geo/area-normalizer";

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
  imageUrl?: string;
  trendScore: number;
  confidence: number;
  priceLevel?: number;
  quietness?: number;
  popularity?: number;
  qualityFlags?: string[];
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
    area: canonicalizeArea(item.area),
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    startTime: parseDate(item.startsAt),
    endTime: parseDate(item.endsAt),
    tags: item.tags,
    source: item.source,
    sourceUrl: item.sourceUrl,
    imageUrl: item.imageUrl,
    trendScore: item.trendScore ?? 0,
    confidence: item.confidence ?? 60,
    priceLevel: item.priceLevel,
    quietness: item.quietness,
    popularity: item.popularity,
    qualityFlags: item.qualityFlags
  };
}

export function buildCitySignalRows(
  item: RawSourceItemDetail,
  sourceKey: string,
  normalizedEntityId: string,
  entity?: NormalizedEntityInput
) {
  const capturedAt = new Date();
  const heatScore = entity?.trendScore ?? item.trendScore ?? item.sourceSignals?.[0]?.score ?? 0;
  const tags = entity?.tags.length ? entity.tags : item.tags;

  return tags.map((tag) => ({
    city: entity?.city ?? item.city ?? "上海",
    area: canonicalizeArea(entity?.area ?? item.area),
    tag,
    heatScore,
    source: item.source,
    capturedAt,
    metadata: {
      sourceKey,
      normalizedEntityId,
      itemType: entity?.entityType ?? item.itemType,
      title: entity?.title ?? item.title,
      sourceSignals: item.sourceSignals ?? []
    }
  }));
}
