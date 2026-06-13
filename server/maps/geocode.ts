export type GeocodeResult = {
  address: string;
  lat: number;
  lng: number;
  provider: "amap" | "mock";
};

export async function geocodeAddress(address: string, city = "上海"): Promise<GeocodeResult | null> {
  if (!process.env.AMAP_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    key: process.env.AMAP_API_KEY,
    address,
    city,
    output: "json"
  });

  const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 }
  });
  const data = (await response.json()) as {
    geocodes?: {
      formatted_address?: string;
      location?: string;
    }[];
  };
  const first = data.geocodes?.[0];

  if (!first?.location) {
    return null;
  }

  const [lngRaw, latRaw] = first.location.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    address: first.formatted_address ?? address,
    lat,
    lng,
    provider: "amap"
  };
}
