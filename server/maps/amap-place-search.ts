export type AmapPlace = {
  id: string;
  name: string;
  address?: string;
  area?: string;
  city?: string;
  lat?: number;
  lng?: number;
  type?: string;
  imageUrl?: string;
};

type FetchLike = typeof fetch;
type AmapPoi = {
  id?: string;
  name?: string;
  address?: string;
  location?: string;
  type?: string;
  cityname?: string;
  adname?: string;
  photos?: { url?: unknown }[];
};

function photo(poi: AmapPoi) {
  return poi.photos?.map((item) => item.url).find((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));
}

export async function searchAmapPlaces(input: {
  city: string;
  query: string;
  limit?: number;
  fetchFn?: FetchLike;
}): Promise<AmapPlace[]> {
  if (!process.env.AMAP_API_KEY) return [];
  const params = new URLSearchParams({
    key: process.env.AMAP_API_KEY,
    keywords: input.query,
    city: input.city,
    citylimit: "true",
    output: "json",
    extensions: "all",
    offset: String(input.limit ?? 8),
    page: "1"
  });
  const response = await (input.fetchFn ?? fetch)(`https://restapi.amap.com/v3/place/text?${params}`, {
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { status?: string; pois?: AmapPoi[] };
  if (data.status && data.status !== "1") return [];
  return (data.pois ?? []).flatMap((poi) => {
    if (!poi.id || !poi.name) return [];
    const [lngRaw, latRaw] = (poi.location ?? "").split(",");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    return [{
      id: poi.id,
      name: poi.name,
      address: typeof poi.address === "string" ? poi.address : undefined,
      area: poi.adname,
      city: poi.cityname,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      type: poi.type,
      imageUrl: photo(poi)
    }];
  });
}

export async function getAmapPlaceById(id: string, city: string) {
  const results = await searchAmapPlaces({ city, query: id, limit: 20 });
  return results.find((place) => place.id === id) ?? null;
}
