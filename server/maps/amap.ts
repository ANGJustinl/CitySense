import type { TrafficInfo, TravelMode } from "@/server/recommendation/types";

type Point = {
  lat: number;
  lng: number;
};

type AmapRouteResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  route?: {
    paths?: {
      distance?: string;
      duration?: string;
    }[];
    transits?: {
      distance?: string;
      duration?: string;
    }[];
  };
};

function routeEndpoint(mode: TravelMode) {
  if (mode === "walking") {
    return "https://restapi.amap.com/v3/direction/walking";
  }

  if (mode === "driving") {
    return "https://restapi.amap.com/v3/direction/driving";
  }

  return "https://restapi.amap.com/v3/direction/transit/integrated";
}

export async function getAmapRouteTraffic(input: {
  city: string;
  origin: Point;
  destination: Point;
  mode: TravelMode;
}): Promise<TrafficInfo | null> {
  if (!process.env.AMAP_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    key: process.env.AMAP_API_KEY,
    origin: `${input.origin.lng},${input.origin.lat}`,
    destination: `${input.destination.lng},${input.destination.lat}`,
    output: "json"
  });

  if (input.mode === "transit") {
    params.set("city", input.city);
  }

  try {
    const response = await fetch(`${routeEndpoint(input.mode)}?${params.toString()}`, {
      next: { revalidate: 60 }
    });
    const data = (await response.json()) as AmapRouteResponse;

    if (data.status !== "1") {
      return null;
    }

    const firstPath = input.mode === "transit" ? data.route?.transits?.[0] : data.route?.paths?.[0];
    const durationSeconds = Number(firstPath?.duration);
    const distance = Number(firstPath?.distance);

    if (!Number.isFinite(durationSeconds)) {
      return null;
    }

    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    return {
      estimatedDurationMinutes: durationMinutes,
      mode: input.mode,
      distanceMeters: Number.isFinite(distance) ? distance : undefined,
      congestion: durationMinutes <= 20 ? "smooth" : durationMinutes <= 40 ? "moderate" : "busy",
      provider: "amap",
      cacheHit: false,
      capturedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
