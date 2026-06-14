import assert from "node:assert/strict";
import test from "node:test";
import { __testing as candidateTesting } from "@/server/recommendation/candidates";
import { buildRoutes } from "@/server/recommendation/route-builder";
import { scoreCandidate } from "@/server/recommendation/scoring";
import { calculateFeedbackPenalty } from "@/server/recommendation/user-signals";
import type {
  Candidate,
  RecommendInput,
  TrafficCandidate
} from "@/server/recommendation/types";

const request: RecommendInput = {
  city: "上海",
  origin: {
    lat: 31.224,
    lng: 121.459
  },
  interests: ["咖啡", "展览"],
  mood: "solo",
  budget: "medium",
  timeWindow: "tonight",
  useRealtimeTraffic: false,
  useSocialSignals: true
};

function candidate(id: string, tags: string[], lat: number, lng: number): Candidate {
  return {
    id,
    name: `候选 ${id}`,
    type: id.includes("event") ? "event" : "venue",
    city: "上海",
    area: "静安",
    address: `${id} 路`,
    lat,
    lng,
    tags,
    trendScore: 72,
    confidence: 80,
    freshnessScore: 78,
    popularity: 62,
    quietness: tags.includes("安静") ? 88 : 50,
    priceLevel: 2,
    source: "mock-city-signal",
    sourceSignals: [],
    recallChannels: ["base", "tag"],
    textRelevance: 70
  };
}

function trafficCandidate(base: Candidate, score: number): TrafficCandidate {
  const scored = scoreCandidate(base, request);

  return {
    ...scored,
    baseScore: score,
    adjustedScore: score,
    traffic: {
      estimatedDurationMinutes: 18,
      mode: "transit",
      provider: "estimated",
      congestion: "smooth"
    }
  };
}

test("weighted ranker score carries V1 metadata", () => {
  const scored = scoreCandidate(candidate("event-a", ["展览", "安静"], 31.22, 121.45), request);

  assert.equal(scored.ranker, "weighted-v1");
  assert.equal(scored.rankerVersion, "weighted-v1.2-profile");
  assert.equal(scored.features.candidateId, "event-a");
  assert.equal(scored.scoreBreakdown.textRelevance, 70);
  assert.equal(scored.features.routeEligible, true);
  assert.ok(typeof scored.features.qualityScore === "number");
});

test("weighted ranker prefers actionable places over generic social listicles", () => {
  const generic = scoreCandidate(
    {
      ...candidate("event-generic", ["静安", "咖啡", "展览", "市集"], 31.22, 121.45),
      name: "上海7月33个活动合集🔥市集&快闪&展览",
      address: undefined,
      lat: undefined,
      lng: undefined,
      source: "xiaohongshu",
      trendScore: 88
    },
    request
  );
  const actionable = scoreCandidate(
    {
      ...candidate("venue-actionable", ["咖啡", "咖啡厅", "静安"], 31.224, 121.459),
      name: "具体咖啡馆",
      address: "南京西路 100 号",
      source: "amap-poi",
      trendScore: 50
    },
    request
  );

  assert.ok(actionable.baseScore > generic.baseScore);
});

test("negative user signals create feedback penalty", () => {
  const penalty = calculateFeedbackPenalty(candidate("venue-a", ["咖啡"], 31.22, 121.45), {
    itemWeights: new Map([["venue-a", -1.5]]),
    tagWeights: new Map([["咖啡", -1.2]]),
    sourceWeights: new Map([["mock-city-signal", -0.8]])
  });

  assert.ok(penalty > 0);
});

test("route assembler returns unique route places", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(candidate("event-a", ["展览", "安静"], 31.22, 121.45), 92),
      trafficCandidate(candidate("venue-b", ["咖啡"], 31.221, 121.451), 88),
      trafficCandidate(candidate("venue-c", ["书店"], 31.23, 121.46), 82),
      trafficCandidate(candidate("event-d", ["音乐"], 31.25, 121.48), 76)
    ],
    request
  );

  assert.ok(routes.length > 0);

  for (const route of routes) {
    const ids = route.places.map((place) => place.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("route assembler fills three routes when top candidates share generic tags", () => {
  const sharedTags = ["静安", "咖啡", "展览", "市集", "夜生活", "独处"];
  const routes = buildRoutes(
    Array.from({ length: 10 }, (_, index) =>
      trafficCandidate(
        candidate(`event-shared-${index}`, sharedTags, 31.22 + index * 0.001, 121.45 + index * 0.001),
        90 - index
      )
    ),
    request
  );

  assert.equal(routes.length, 3);
  assert.equal(new Set(routes.map((route) => route.places[0]?.id)).size, 3);
});

test("route assembler avoids reusing places across routes when enough candidates exist", () => {
  const routes = buildRoutes(
    Array.from({ length: 8 }, (_, index) =>
      trafficCandidate(
        candidate(
          `venue-distinct-${index}`,
          index % 2 === 0 ? ["咖啡", "书店"] : ["展览", "独立音乐"],
          31.22 + index * 0.001,
          121.45 + index * 0.001
        ),
        90 - index
      )
    ),
    request
  );
  const placeIds = routes.flatMap((route) => route.places.map((place) => place.id));

  assert.equal(routes.length, 3);
  assert.equal(new Set(placeIds).size, placeIds.length);
});

test("route assembler prefers fully addressed routes when addressable candidates exist", () => {
  const addressable = Array.from({ length: 6 }, (_, index) =>
    trafficCandidate(
      candidate(
        `venue-addressed-${index}`,
        index % 2 === 0 ? ["咖啡", "书店"] : ["展览", "独立音乐"],
        31.22 + index * 0.001,
        121.45 + index * 0.001
      ),
      70 - index
    )
  );
  const vague = Array.from({ length: 8 }, (_, index) =>
    trafficCandidate(
      {
        ...candidate(
          `event-vague-${index}`,
          ["咖啡", "展览", "市集"],
          31.3 + index * 0.001,
          121.5 + index * 0.001
        ),
        address: undefined,
        lat: undefined,
        lng: undefined
      },
      90 - index
    )
  );
  const routes = buildRoutes([...vague, ...addressable], request);
  const places = routes.flatMap((route) => route.places);

  assert.equal(routes.length, 3);
  assert.equal(places.every((place) => Boolean(place.address)), true);
});

test("candidate area matching treats district suffix as the same area", () => {
  assert.equal(candidateTesting.matchesCandidateArea("静安区", "静安"), true);
  assert.equal(candidateTesting.matchesCandidateArea("静安", "静安区"), true);
  assert.equal(candidateTesting.matchesCandidateArea("徐汇", "静安"), false);
});
