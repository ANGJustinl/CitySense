import { prisma } from "@/server/db/prisma";
import type { TrafficInfo, TravelMode } from "@/server/recommendation/types";

type Point = {
  lat: number;
  lng: number;
};

type TrafficCacheInput = {
  city: string;
  origin: Point;
  destination: Point;
  mode: TravelMode;
};

const DEFAULT_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

function normalizedInput(input: TrafficCacheInput) {
  return {
    city: input.city,
    mode: input.mode,
    originLat: roundCoordinate(input.origin.lat),
    originLng: roundCoordinate(input.origin.lng),
    destLat: roundCoordinate(input.destination.lat),
    destLng: roundCoordinate(input.destination.lng)
  };
}

function providerFromRawPayload(rawPayload: unknown): TrafficInfo["provider"] {
  if (
    rawPayload &&
    typeof rawPayload === "object" &&
    "provider" in rawPayload &&
    rawPayload.provider === "amap"
  ) {
    return "amap";
  }

  return "estimated";
}

export async function readTrafficSnapshot(
  input: TrafficCacheInput,
  maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS
): Promise<TrafficInfo | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const normalized = normalizedInput(input);

  try {
    const snapshot = await prisma.trafficSnapshot.findFirst({
      where: {
        ...normalized,
        capturedAt: {
          gte: new Date(Date.now() - maxAgeMs)
        }
      },
      orderBy: {
        capturedAt: "desc"
      }
    });

    if (!snapshot?.duration) {
      return null;
    }

    return {
      estimatedDurationMinutes: snapshot.duration,
      mode: input.mode,
      distanceMeters: snapshot.distance ?? undefined,
      congestion: snapshot.congestion ?? undefined,
      provider: providerFromRawPayload(snapshot.rawPayload),
      cacheHit: true,
      capturedAt: snapshot.capturedAt.toISOString()
    };
  } catch {
    return null;
  }
}

export async function writeTrafficSnapshot(input: TrafficCacheInput, traffic: TrafficInfo) {
  if (!hasDatabaseUrl()) {
    return;
  }

  const normalized = normalizedInput(input);

  try {
    await prisma.trafficSnapshot.create({
      data: {
        ...normalized,
        distance: traffic.distanceMeters ? Math.round(traffic.distanceMeters) : undefined,
        duration: traffic.estimatedDurationMinutes,
        congestion: traffic.congestion,
        rawPayload: {
          provider: traffic.provider,
          cacheHit: false,
          durationUnit: "minutes"
        }
      }
    });
  } catch {
    // Traffic caching should never block recommendations.
  }
}
