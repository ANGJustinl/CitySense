import { prisma } from "@/server/db/prisma";
import type { AmapLegPlan } from "@/server/maps/amap";
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

type LegPlanRawPayload = {
  provider: "amap";
  durationUnit: "minutes";
  legPlan: {
    polyline: [number, number][];
    steps: AmapLegPlan["steps"];
    transitLines: string[];
  };
};

function legPlanFromRawPayload(rawPayload: unknown): LegPlanRawPayload["legPlan"] | null {
  if (
    !rawPayload ||
    typeof rawPayload !== "object" ||
    !("legPlan" in rawPayload) ||
    !rawPayload.legPlan ||
    typeof rawPayload.legPlan !== "object"
  ) {
    return null;
  }

  const legPlan = rawPayload.legPlan as LegPlanRawPayload["legPlan"];

  return Array.isArray(legPlan.polyline) ? legPlan : null;
}

export async function readLegPlanSnapshot(
  input: TrafficCacheInput,
  maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS
): Promise<AmapLegPlan & { capturedAt: string } | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const normalized = normalizedInput(input);

  try {
    const snapshots = await prisma.trafficSnapshot.findMany({
      where: {
        ...normalized,
        capturedAt: {
          gte: new Date(Date.now() - maxAgeMs)
        }
      },
      orderBy: {
        capturedAt: "desc"
      },
      take: 5
    });
    // 同一 OD 对可能既有重排写入的纯耗时快照、又有含 legPlan 的快照，取最近一条带 legPlan 的。
    const snapshot = snapshots.find(
      (item) => item.duration && legPlanFromRawPayload(item.rawPayload)
    );

    if (!snapshot?.duration) {
      return null;
    }

    const legPlan = legPlanFromRawPayload(snapshot.rawPayload);

    if (!legPlan) {
      return null;
    }

    return {
      durationMinutes: snapshot.duration,
      distanceMeters: snapshot.distance ?? undefined,
      congestion: snapshot.congestion ?? undefined,
      polyline: legPlan.polyline,
      steps: legPlan.steps ?? [],
      transitLines: legPlan.transitLines ?? [],
      capturedAt: snapshot.capturedAt.toISOString()
    };
  } catch {
    return null;
  }
}

export async function writeLegPlanSnapshot(input: TrafficCacheInput, plan: AmapLegPlan) {
  if (!hasDatabaseUrl()) {
    return;
  }

  const normalized = normalizedInput(input);
  const rawPayload: LegPlanRawPayload = {
    provider: "amap",
    durationUnit: "minutes",
    legPlan: {
      polyline: plan.polyline,
      steps: plan.steps,
      transitLines: plan.transitLines
    }
  };

  try {
    await prisma.trafficSnapshot.create({
      data: {
        ...normalized,
        distance: plan.distanceMeters ? Math.round(plan.distanceMeters) : undefined,
        duration: plan.durationMinutes,
        congestion: plan.congestion,
        rawPayload: JSON.parse(JSON.stringify(rawPayload))
      }
    });
  } catch {
    // Traffic caching should never block recommendations.
  }
}
