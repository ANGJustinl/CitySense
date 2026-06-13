import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";

type AmapPoi = {
  id?: string;
  name?: string;
  address?: string;
  location?: string;
  type?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
};

function toPoiItem(poi: AmapPoi, city: string): RawSourceItemDetail | null {
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
    title: poi.name,
    content: poi.type,
    rawPayload: poi,
    city,
    area: poi.adname,
    status: "parsed",
    itemType: "venue",
    address: typeof poi.address === "string" ? poi.address : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    tags: (poi.type ?? "城市地点").split(";").slice(0, 4),
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

export const amapPoiAdapter: CitySourceAdapter = {
  source: "amap-poi",
  kind: "api",
  status: process.env.AMAP_API_KEY ? "active" : "not_configured",
  async searchEvents() {
    return [];
  },
  async searchVenues(input) {
    if (!process.env.AMAP_API_KEY) {
      return [];
    }

    const params = new URLSearchParams({
      key: process.env.AMAP_API_KEY,
      keywords: input.keywords.join("|") || "咖啡|展览|书店",
      city: input.city,
      output: "json",
      offset: "10",
      page: "1"
    });

    const response = await fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`, {
      next: { revalidate: 60 * 30 }
    });
    const data = (await response.json()) as { pois?: AmapPoi[] };

    return (data.pois ?? [])
      .map((poi) => toPoiItem(poi, input.city))
      .filter((item): item is RawSourceItemDetail => Boolean(item));
  },
  async getItemDetail() {
    return null;
  }
};
