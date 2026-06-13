import { prisma } from "@/server/db/prisma";
import { isDemoModeEnabled, MOCK_SOURCE_NAMES } from "@/server/config/demo-mode";

export type PulseMetric = {
  label: string;
  value: number;
};

export type CityPulseResponse = {
  topTags: PulseMetric[];
  sourceMix: PulseMetric[];
  trafficCache: TrafficCachePulse;
  feedbackTrend: PulseMetric[];
  rankerMix: PulseMetric[];
  generatedAt: string;
};

export type TrafficCachePulse = {
  providerMix: PulseMetric[];
  snapshotCount: number;
  latestCapturedAt?: string;
  latestAgeMinutes?: number;
};

type TrafficSnapshotPulseRow = {
  rawPayload: unknown;
  capturedAt: Date | string;
};

function topEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value
    }));
}

function increment(counts: Map<string, number>, label: string | null | undefined, amount = 1) {
  if (!label) {
    return;
  }

  counts.set(label, (counts.get(label) ?? 0) + amount);
}

function rawPayloadProvider(rawPayload: unknown) {
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

function capturedAtTime(value: Date | string) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
}

export function summarizeTrafficCache(snapshots: TrafficSnapshotPulseRow[]): TrafficCachePulse {
  const providerCounts = new Map<string, number>();
  let latestTime: number | undefined;

  for (const snapshot of snapshots) {
    increment(providerCounts, rawPayloadProvider(snapshot.rawPayload));

    const time = capturedAtTime(snapshot.capturedAt);

    if (time !== undefined && (latestTime === undefined || time > latestTime)) {
      latestTime = time;
    }
  }

  return {
    providerMix: topEntries(providerCounts, 3),
    snapshotCount: snapshots.length,
    latestCapturedAt: latestTime === undefined ? undefined : new Date(latestTime).toISOString(),
    latestAgeMinutes:
      latestTime === undefined
        ? undefined
        : Math.max(0, Math.round((Date.now() - latestTime) / 60_000))
  };
}

export async function getCityPulse(input: {
  city: string;
  area?: string;
}): Promise<CityPulseResponse> {
  const generatedAt = new Date().toISOString();
  const entitySourceFilter = isDemoModeEnabled()
    ? {}
    : {
        NOT: [
          {
            source: {
              in: [...MOCK_SOURCE_NAMES]
            }
          },
          {
            sourceKey: {
              startsWith: "demo:"
            }
          }
        ]
      };
  const signalSourceFilter = isDemoModeEnabled()
    ? {}
    : {
        source: {
          notIn: [...MOCK_SOURCE_NAMES]
        }
      };

  try {
    const [events, venues, citySignals, feedbacks, featureSnapshots, trafficSnapshots] =
      await Promise.all([
        prisma.event.findMany({
          where: {
            city: input.city,
            ...(input.area ? { area: input.area } : {}),
            ...entitySourceFilter
          },
          orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
          take: 80
        }),
        prisma.venue.findMany({
          where: {
            city: input.city,
            ...(input.area ? { area: input.area } : {}),
            ...entitySourceFilter
          },
          orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
          take: 80
        }),
        prisma.citySignal.findMany({
          where: {
            city: input.city,
            ...(input.area ? { area: input.area } : {}),
            ...signalSourceFilter
          },
          orderBy: [{ capturedAt: "desc" }, { heatScore: "desc" }],
          take: 80
        }),
        prisma.recommendationFeedback.groupBy({
          by: ["value"],
          _count: {
            value: true
          },
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 86_400_000)
            }
          }
        }),
        prisma.recommendationFeatureSnapshot.groupBy({
          by: ["ranker"],
          _count: {
            ranker: true
          },
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 86_400_000)
            }
          }
        }),
        prisma.trafficSnapshot.findMany({
          where: {
            city: input.city
          },
          orderBy: {
            capturedAt: "desc"
          },
          take: 80
        })
      ]);
    const tagCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();

    for (const signal of citySignals) {
      increment(tagCounts, signal.tag, signal.heatScore);
      increment(sourceCounts, signal.source);
    }

    for (const event of events) {
      for (const tag of event.tags) {
        increment(tagCounts, tag, Math.max(1, event.trendScore));
      }

      increment(sourceCounts, event.source ?? "database");
    }

    for (const venue of venues) {
      for (const tag of venue.tags) {
        increment(tagCounts, tag, Math.max(1, venue.trendScore));
      }

      increment(sourceCounts, venue.source ?? "database");
    }

    return {
      topTags: topEntries(tagCounts, 6),
      sourceMix: topEntries(sourceCounts, 5),
      trafficCache: summarizeTrafficCache(trafficSnapshots),
      feedbackTrend: feedbacks.map((item) => ({
        label: item.value,
        value: item._count.value
      })),
      rankerMix: featureSnapshots.map((item) => ({
        label: item.ranker,
        value: item._count.ranker
      })),
      generatedAt
    };
  } catch {
    return {
      topTags: [],
      sourceMix: [],
      trafficCache: {
        providerMix: [],
        snapshotCount: 0
      },
      feedbackTrend: [],
      rankerMix: [],
      generatedAt
    };
  }
}
