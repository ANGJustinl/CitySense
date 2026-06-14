import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendationTrace,
  countXiaohongshuPlacesInRoutes
} from "@/server/recommendation/city-profile";
import type { RecommendResponse, RecommendedRoute } from "@/server/recommendation/types";

/**
 * These tests exercise the pure-logic parts of city-profile.ts that don't need
 * a database: the recommendation trace assembly and route-place counting.
 *
 * getCityProfile() and the prisma-backed parts of buildRecommendationTrace()
 * are integration-level (they hit Postgres); they're covered by the live demo
 * instead. Here we inject a minimal fake prisma via module-level mock so the
 * trace assembly logic is tested deterministically.
 */

// Minimal RecommendResponse fixture — only the fields buildRecommendationTrace reads.
function fakeRecommendation(overrides: Partial<RecommendResponse> = {}): RecommendResponse {
  return {
    routes: [],
    meta: {
      candidateCount: 41,
      trafficProvider: "estimated",
      ranker: "weighted-v1",
      rankerVersion: "weighted-v1.1",
      recallChannels: ["base", "text", "city-signal"],
      generatedAt: new Date().toISOString()
    },
    ...overrides
  };
}

function fakeRoute(overrides: Partial<RecommendedRoute> = {}): RecommendedRoute {
  return {
    id: "route-1",
    title: "测试路线",
    summary: "A -> B",
    totalScore: 80,
    scoreBreakdown: {
      taste: 80, textRelevance: 70, socialTrend: 75, freshness: 65, distance: 70,
      traffic: 72, timeFit: 78, novelty: 60, actionability: 90, userAffinity: 50,
      feedbackPenalty: 0, exposurePenalty: 0
    },
    traffic: { estimatedDurationMinutes: 30, mode: "transit", provider: "estimated" },
    sourceSignals: [],
    places: [
      { id: "p1", name: "地点A", type: "venue", tags: ["咖啡"], source: "amap-poi" }
    ],
    reason: "测试",
    tips: [],
    ...overrides
  };
}

test("countXiaohongshuPlacesInRoutes: counts places with source=xiaohongshu only", () => {
  const routes = [
    fakeRoute({
      id: "r1",
      places: [
        { id: "p1", name: "A", type: "venue", tags: [], source: "amap-poi" },
        { id: "p2", name: "B", type: "venue", tags: [], source: "xiaohongshu" }
      ]
    }),
    fakeRoute({
      id: "r2",
      places: [{ id: "p3", name: "C", type: "event", tags: [], source: "xiaohongshu" }]
    })
  ];

  assert.equal(countXiaohongshuPlacesInRoutes(routes), 2);
  assert.equal(countXiaohongshuPlacesInRoutes([]), 0);
});

test("countXiaohongshuPlacesInRoutes: returns 0 when no xhs places", () => {
  const routes = [fakeRoute()];
  assert.equal(countXiaohongshuPlacesInRoutes(routes), 0);
});

test("buildRecommendationTrace: emits recall entry from candidateCount", async () => {
  // Mock prisma so buildRecommendationTrace doesn't hit the DB.
  const trace = await withMockedPrisma(
    {
      citySignal: {
        count: async () => 0,
        findFirst: async () => null
      },
      citySignalPlaceMatch: {
        groupBy: async () => []
      }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        area: "静安寺",
        recommendation: fakeRecommendation()
      })
  );

  const recall = trace.entries.find((e) => e.kind === "recall");
  assert.ok(recall, "expected a recall entry");
  assert.match(recall.message, /41/);
  assert.equal(recall.source, "recommendation.meta.candidateCount");
});

test("buildRecommendationTrace: warns when xhs signal count is 0", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 0, findFirst: async () => null },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation()
      })
  );

  const signal = trace.entries.find((e) => e.kind === "signal");
  assert.ok(signal);
  assert.equal(signal.tone, "warn");
  assert.match(signal.message, /暂无小红书/);
});

test("buildRecommendationTrace: reports xhs signals with top tag when present", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: {
        count: async () => 1190,
        findFirst: async () => ({ tag: "咖啡", heatScore: 79, area: "静安寺", city: "上海", source: "xiaohongshu", id: "s1", capturedAt: new Date(), metadata: null })
      },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        area: "静安寺",
        recommendation: fakeRecommendation()
      })
  );

  const signal = trace.entries.find((e) => e.kind === "signal");
  assert.ok(signal);
  assert.equal(signal.tone, "ok");
  assert.match(signal.message, /1190/);
  assert.match(signal.message, /咖啡/);
});

test("buildRecommendationTrace: flags drop when no confirmed venue matches", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 100, findFirst: async () => null },
      citySignalPlaceMatch: {
        groupBy: async () => [
          { status: "topic_only", _count: { status: 60 } },
          { status: "no_candidate", _count: { status: 40 } }
        ]
      }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation()
      })
  );

  const filter = trace.entries.find((e) => e.kind === "filter");
  assert.ok(filter);
  assert.equal(filter.tone, "drop");
  assert.match(filter.message, /confirmed=0/);
  assert.match(filter.message, /topic_only=60/);
});

test("buildRecommendationTrace: compose entry lists place sources per route", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 0, findFirst: async () => null },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation({
          routes: [
            fakeRoute({
              id: "r1",
              title: "路线1",
              places: [
                { id: "p1", name: "美术馆", type: "venue", tags: ["展览"], source: "amap-poi" },
                { id: "p2", name: "咖啡馆", type: "venue", tags: ["咖啡"], source: "amap-poi" }
              ]
            })
          ]
        })
      })
  );

  const compose = trace.entries.find((e) => e.kind === "compose");
  assert.ok(compose);
  assert.match(compose.message, /美术馆\(amap-poi\)/);
  assert.match(compose.message, /咖啡馆\(amap-poi\)/);
});

test("buildRecommendationTrace: summary is honest about xhs place contribution", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 50, findFirst: async () => null },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation({
          routes: [fakeRoute({ places: [{ id: "p1", name: "A", type: "venue", tags: [], source: "amap-poi" }] })]
        })
      })
  );

  // No xhs places → summary must say "indirect only".
  assert.match(trace.summary, /间接影响/);
  assert.match(trace.summary, /venue 绑定/);
});

test("buildRecommendationTrace: summary credits xhs when it contributes a place", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 50, findFirst: async () => null },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation({
          routes: [
            fakeRoute({
              places: [{ id: "p1", name: "网红店", type: "venue", tags: [], source: "xiaohongshu" }]
            })
          ]
        })
      })
  );

  assert.match(trace.summary, /小红书直接贡献了 1 个路线地点/);
});

test("buildRecommendationTrace: every entry cites its data source", async () => {
  const trace = await withMockedPrisma(
    {
      citySignal: { count: async () => 10, findFirst: async () => null },
      citySignalPlaceMatch: { groupBy: async () => [] }
    },
    () =>
      buildRecommendationTrace({
        city: "上海",
        recommendation: fakeRecommendation()
      })
  );

  for (const entry of trace.entries) {
    assert.ok(entry.source.length > 0, `entry "${entry.message}" has no source citation`);
  }
});

// Helper: temporarily swap the module's prisma import with a fake, run fn, restore.
// We do this by monkeypatching the exported prisma singleton's methods.
type PrismaFake = {
  citySignal?: { count?: () => Promise<unknown>; findFirst?: () => Promise<unknown> };
  citySignalPlaceMatch?: { groupBy?: () => Promise<unknown> };
};

async function withMockedPrisma<T>(fake: PrismaFake, fn: () => Promise<T>): Promise<T> {
  const { prisma } = await import("@/server/db/prisma");
  const original = {
    citySignalCount: prisma.citySignal.count,
    citySignalFindFirst: prisma.citySignal.findFirst,
    cspmGroupBy: prisma.citySignalPlaceMatch.groupBy
  };

  if (fake.citySignal?.count) prisma.citySignal.count = fake.citySignal.count as never;
  if (fake.citySignal?.findFirst) prisma.citySignal.findFirst = fake.citySignal.findFirst as never;
  if (fake.citySignalPlaceMatch?.groupBy)
    prisma.citySignalPlaceMatch.groupBy = fake.citySignalPlaceMatch.groupBy as never;

  try {
    return await fn();
  } finally {
    prisma.citySignal.count = original.citySignalCount;
    prisma.citySignal.findFirst = original.citySignalFindFirst;
    prisma.citySignalPlaceMatch.groupBy = original.cspmGroupBy;
  }
}
