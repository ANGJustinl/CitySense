import { prisma } from "@/server/db/prisma";

export type PulseMetric = {
  label: string;
  value: number;
};

export type CityPulseResponse = {
  topTags: PulseMetric[];
  sourceMix: PulseMetric[];
  feedbackTrend: PulseMetric[];
  rankerMix: PulseMetric[];
  generatedAt: string;
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

export async function getCityPulse(input: {
  city: string;
  area?: string;
}): Promise<CityPulseResponse> {
  const generatedAt = new Date().toISOString();

  try {
    const [events, venues, citySignals, feedbacks, featureSnapshots] = await Promise.all([
      prisma.event.findMany({
        where: {
          city: input.city,
          ...(input.area ? { area: input.area } : {})
        },
        orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
        take: 80
      }),
      prisma.venue.findMany({
        where: {
          city: input.city,
          ...(input.area ? { area: input.area } : {})
        },
        orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
        take: 80
      }),
      prisma.citySignal.findMany({
        where: {
          city: input.city,
          ...(input.area ? { area: input.area } : {})
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
      feedbackTrend: [],
      rankerMix: [],
      generatedAt
    };
  }
}
