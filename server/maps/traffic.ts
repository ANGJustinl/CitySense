import type { TrafficInfo, TravelMode } from "@/server/recommendation/types";
import { getAmapRouteTraffic } from "@/server/maps/amap";

type Point = {
  lat: number;
  lng: number;
};

export function getTrafficReachabilityScore(durationMinutes: number, mode: TravelMode) {
  if (mode === "walking") {
    if (durationMinutes <= 10) return 100;
    if (durationMinutes <= 20) return 80;
    if (durationMinutes <= 35) return 55;
    return 30;
  }

  if (mode === "transit") {
    if (durationMinutes <= 20) return 90;
    if (durationMinutes <= 40) return 70;
    if (durationMinutes <= 60) return 45;
    return 20;
  }

  if (durationMinutes <= 15) return 92;
  if (durationMinutes <= 30) return 74;
  if (durationMinutes <= 45) return 52;
  return 28;
}

export function distanceMeters(a: Point, b: Point) {
  const radius = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function estimateTrafficInfo(input: {
  origin?: Point;
  destination?: Point;
  mode: TravelMode;
}): TrafficInfo {
  if (!input.origin || !input.destination) {
    return {
      estimatedDurationMinutes: 22,
      mode: input.mode,
      distanceMeters: undefined,
      congestion: "unknown",
      provider: "estimated"
    };
  }

  const distance = distanceMeters(input.origin, input.destination);
  const metersPerMinute =
    input.mode === "walking" ? 75 : input.mode === "driving" ? 420 : 260;
  const transferPenalty = input.mode === "transit" ? 8 : 0;
  const estimatedDurationMinutes = Math.max(
    6,
    Math.round(distance / metersPerMinute + transferPenalty)
  );

  return {
    estimatedDurationMinutes,
    mode: input.mode,
    distanceMeters: distance,
    congestion:
      estimatedDurationMinutes <= 18
        ? "smooth"
        : estimatedDurationMinutes <= 35
          ? "moderate"
          : "busy",
    provider: "estimated"
  };
}

export async function resolveTrafficInfo(input: {
  city: string;
  origin?: Point;
  destination?: Point;
  mode: TravelMode;
  useRealtimeTraffic?: boolean;
}): Promise<TrafficInfo> {
  if (input.useRealtimeTraffic && input.origin && input.destination && process.env.AMAP_API_KEY) {
    const amapTraffic = await getAmapRouteTraffic({
      city: input.city,
      origin: input.origin,
      destination: input.destination,
      mode: input.mode
    });

    if (amapTraffic) {
      return amapTraffic;
    }
  }

  return estimateTrafficInfo({
    origin: input.origin,
    destination: input.destination,
    mode: input.mode
  });
}
