import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(scored.rankerVersion, "2026-06-13");
  assert.equal(scored.features.candidateId, "event-a");
  assert.equal(scored.scoreBreakdown.textRelevance, 70);
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
