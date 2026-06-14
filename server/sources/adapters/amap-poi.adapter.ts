import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";

type FetchLike = typeof fetch;

type AmapPoiAdapterOptions = {
  fetchFn?: FetchLike;
};

type AmapPoiSearchInput = Parameters<CitySourceAdapter["searchVenues"]>[0] & {
  fetchFn?: FetchLike;
  limitPerKeyword?: number;
};

type AmapPoi = {
  id?: string;
  name?: string;
  address?: string;
  location?: string;
  type?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  photos?: {
    title?: unknown;
    url?: unknown;
  }[];
};

function firstPhotoUrl(poi: AmapPoi) {
  if (!Array.isArray(poi.photos)) {
    return undefined;
  }

  for (const photo of poi.photos) {
    if (typeof photo?.url === "string" && /^https?:\/\//.test(photo.url)) {
      return photo.url;
    }
  }

  return undefined;
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function poiKey(poi: AmapPoi) {
  return poi.id ?? [poi.name, poi.address, poi.adname].filter(Boolean).join("|");
}

function searchKeywordFor(keyword: string) {
  if (keyword === "独立音乐") {
    return "livehouse";
  }

  return keyword;
}

function toPoiItem(poi: AmapPoi, city: string, keyword: string): RawSourceItemDetail | null {
  if (!poi.name) {
    return null;
  }

  const [lngRaw, latRaw] = (poi.location ?? "").split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  return {
    id: `amap-${poi.id ?? poi.name}`,
    source: "amap-poi",
    sourceId: poi.id,
    sourceUrl: poi.id ? `https://ditu.amap.com/place/${poi.id}` : undefined,
    title: poi.name,
    content: poi.type,
    rawPayload: poi,
    city,
    area: poi.adname,
    status: "new",
    itemType: "venue",
    address: typeof poi.address === "string" ? poi.address : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    imageUrl: firstPhotoUrl(poi),
    tags: uniqueTags([keyword, ...(poi.type ?? "城市地点").split(";")]).slice(0, 5),
    trendScore: 50,
    confidence: 68,
    popularity: 55,
    quietness: 55,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "amap-poi",
        label: "高德 POI 命中",
        score: 68,
        evidence: poi.type
      }
    ]
  };
}

export async function searchAmapPoiVenueItems(input: AmapPoiSearchInput) {
  const apiKey = process.env.AMAP_API_KEY;

  if (!apiKey) {
    return [];
  }

  const fetchFn = input.fetchFn ?? fetch;
  const keywords = input.keywords.length > 0 ? input.keywords : ["咖啡", "展览", "书店"];
  const results = await Promise.all(
    keywords.map(async (keyword) => {
      const searchKeyword = searchKeywordFor(keyword);
      const params = new URLSearchParams({
        key: apiKey,
        keywords: input.area ? `${input.area} ${searchKeyword}` : searchKeyword,
        city: input.city,
        output: "json",
        extensions: "all",
        offset: String(input.limitPerKeyword ?? 6),
        page: "1"
      });

      const response = await fetchFn(`https://restapi.amap.com/v3/place/text?${params.toString()}`, {
        next: { revalidate: 60 * 30 }
      });
      const data = (await response.json()) as { pois?: AmapPoi[] };

      return (data.pois ?? []).map((poi) => ({
        keyword,
        poi
      }));
    })
  );
  const seen = new Set<string>();

  return results
    .flat()
    .filter(({ poi }) => {
      const key = poiKey(poi);
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map(({ keyword, poi }) => toPoiItem(poi, input.city, keyword))
    .filter((item): item is RawSourceItemDetail => Boolean(item));
}

class AmapPoiAdapter extends BaseCitySourceAdapter {
  private fetchFn: FetchLike;

  constructor(options: AmapPoiAdapterOptions = {}) {
    super({
      source: "amap-poi",
      kind: "api",
      enabledByDefault: true,
      cooldownSeconds: 300,
      requiredEnvVars: ["AMAP_API_KEY"]
    });
    this.fetchFn = options.fetchFn ?? fetch;
  }

  protected async searchEventsImpl() {
    return [];
  }

  protected async searchVenuesImpl(input: Parameters<CitySourceAdapter["searchVenues"]>[0]) {
    return searchAmapPoiVenueItems({
      ...input,
      fetchFn: this.fetchFn
    });
  }

  protected async getItemDetailImpl() {
    return null;
  }
}

export function createAmapPoiAdapter(options?: AmapPoiAdapterOptions): CitySourceAdapter {
  return new AmapPoiAdapter(options);
}

export const amapPoiAdapter: CitySourceAdapter = createAmapPoiAdapter();
