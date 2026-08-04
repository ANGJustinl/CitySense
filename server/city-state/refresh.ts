import { prisma } from "@/server/db/prisma";
import { estimateCrowdCondition } from "@/server/city-state/crowd";
import { buildFreshnessCondition } from "@/server/city-state/freshness";
import {
  summarizeConditionSnapshots,
  writeConditionSnapshots
} from "@/server/city-state/snapshots";
import { resolveSentimentCondition } from "@/server/city-state/sentiment";
import type { CityStateRefreshInput, CityStateRefreshResult } from "@/server/city-state/types";
import { refreshWeatherCondition } from "@/server/city-state/weather";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

type RefreshDeps = {
  now?: Date;
  weather?: typeof refreshWeatherCondition;
  sentiment?: typeof resolveSentimentCondition;
};

function areaWhere(area?: string) {
  return area ? { area } : {};
}

function latestDate(values: Array<Date | null | undefined>) {
  return values
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

async function loadRefreshContext(input: CityStateRefreshInput, now: Date) {
  const recentAfter = new Date(now.getTime() - RECENT_WINDOW_MS);
  const [events, venues, citySignals, trafficSnapshots, rawItems, connectors, conditions] =
    await Promise.all([
      prisma.event.findMany({
        where: {
          city: input.city,
          ...areaWhere(input.area)
        },
        orderBy: [{ trendScore: "desc" }, { updatedAt: "desc" }],
        take: 80
      }),
      prisma.venue.findMany({
        where: {
          city: input.city,
          ...areaWhere(input.area)
        },
        orderBy: [{ trendScore: "desc" }, { updatedAt: "desc" }],
        take: 80
      }),
      prisma.citySignal.findMany({
        where: {
          city: input.city,
          ...areaWhere(input.area),
          capturedAt: {
            gte: recentAfter
          }
        },
        orderBy: [{ capturedAt: "desc" }, { heatScore: "desc" }],
        take: 80
      }),
      prisma.trafficSnapshot.findMany({
        where: {
          city: input.city,
          capturedAt: {
            gte: recentAfter
          }
        },
        orderBy: {
          capturedAt: "desc"
        },
        take: 80
      }),
      prisma.rawSourceItem.findMany({
        where: {
          city: input.city,
          ...areaWhere(input.area)
        },
        orderBy: {
          lastSeenAt: "desc"
        },
        take: 80
      }),
      prisma.sourceConnector.findMany({
        orderBy: {
          updatedAt: "desc"
        },
        take: 40
      }),
      prisma.cityConditionSnapshot.findMany({
        where: {
          city: input.city,
          ...areaWhere(input.area)
        },
        orderBy: {
          capturedAt: "desc"
        },
        take: 20
      })
    ]);

  return {
    events,
    venues,
    citySignals,
    trafficSnapshots,
    rawItems,
    connectors,
    conditions
  };
}

export async function refreshCityConditions(
  input: CityStateRefreshInput,
  deps: RefreshDeps = {}
): Promise<CityStateRefreshResult> {
  const now = deps.now ?? new Date();
  const weather = deps.weather ?? refreshWeatherCondition;
  const sentiment = deps.sentiment ?? resolveSentimentCondition;
  const [weatherCondition, context] = await Promise.all([
    weather({
      city: input.city,
      area: input.area,
      now
    }),
    loadRefreshContext(input, now)
  ]);
  const crowdCondition = estimateCrowdCondition({
    city: input.city,
    area: input.area,
    venues: context.venues,
    events: context.events,
    citySignals: context.citySignals,
    trafficSnapshots: context.trafficSnapshots,
    now
  });
  const sentimentCondition = await sentiment({
    city: input.city,
    area: input.area,
    samples: context.citySignals,
    now
  });
  const freshnessCondition = buildFreshnessCondition({
    city: input.city,
    area: input.area,
    sources: [
      {
        name: "raw-source-items",
        latestAt: latestDate(context.rawItems.map((item) => item.lastSeenAt)),
        count: context.rawItems.length
      },
      {
        name: "city-signals",
        latestAt: latestDate(context.citySignals.map((item) => item.capturedAt)),
        count: context.citySignals.length
      },
      {
        name: "traffic-cache",
        latestAt: latestDate(context.trafficSnapshots.map((item) => item.capturedAt)),
        count: context.trafficSnapshots.length
      },
      {
        name: "source-connectors",
        latestAt: latestDate(context.connectors.map((item) => item.lastSuccessAt)),
        count: context.connectors.length
      },
      {
        name: "condition-cache",
        latestAt: latestDate(context.conditions.map((item) => item.capturedAt)),
        count: context.conditions.length
      }
    ],
    now
  });
  const drafts = [weatherCondition, crowdCondition, sentimentCondition, freshnessCondition];
  const snapshots = await writeConditionSnapshots(drafts);
  const refreshed = summarizeConditionSnapshots(snapshots.length > 0 ? snapshots : drafts, {
    area: input.area,
    includeExpired: true,
    now: now.getTime()
  });

  return {
    city: input.city,
    area: input.area,
    status: "completed",
    refreshed,
    generatedAt: now.toISOString()
  };
}
