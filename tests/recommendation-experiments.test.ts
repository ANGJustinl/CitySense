import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRecommendationExperiment,
  assignRecommendationExperiment
} from "@/server/recommendation/experiments";
import { scoreCandidate } from "@/server/recommendation/scoring";
import type {
  Candidate,
  RecommendInput,
  TrafficCandidate
} from "@/server/recommendation/types";

const request: RecommendInput = {
  city: "上海",
  area: "静安",
  userId: "user-exp-1",
  interests: ["咖啡", "展览"],
  mood: "solo",
  budget: "medium",
  timeWindow: "tonight",
  useRealtimeTraffic: false,
  useSocialSignals: true
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "venue-1",
    name: "可信咖啡展览空间",
    type: "venue",
    city: "上海",
    area: "静安",
    address: "南京西路 100 号",
    lat: 31.22,
    lng: 121.45,
    tags: ["咖啡", "展览"],
    trendScore: 72,
    confidence: 82,
    freshnessScore: 78,
    popularity: 60,
    quietness: 70,
    priceLevel: 2,
    source: "amap-poi",
    sourceSignals: [{ source: "amap-poi", label: "高德 POI", score: 82 }],
    recallChannels: ["base", "tag"],
    textRelevance: 80,
    routeEligible: true,
    ...overrides
  };
}

function trafficCandidate(input: Candidate): TrafficCandidate {
  const scored = scoreCandidate(input, request);

  return {
    ...scored,
    adjustedScore: scored.baseScore,
    traffic: {
      estimatedDurationMinutes: 16,
      mode: "transit",
      provider: "estimated"
    }
  };
}

test("assignRecommendationExperiment is deterministic for the same bucket key", () => {
  const first = assignRecommendationExperiment(request);
  const second = assignRecommendationExperiment({ ...request });

  assert.deepEqual(first, second);
  assert.equal(first.bucketKey, "user-exp-1");
});

test("assignRecommendationExperiment ignores request override outside safe mode", () => {
  const previous = process.env.CITYSENSE_EXPERIMENT_OVERRIDE;
  delete process.env.CITYSENSE_EXPERIMENT_OVERRIDE;

  const baseline = assignRecommendationExperiment(request);
  const assigned = assignRecommendationExperiment({
    ...request,
    experimentVariant: baseline.variant === "control" ? "trust-aware-v1" : "control"
  });

  assert.deepEqual(assigned, baseline);

  if (previous === undefined) {
    delete process.env.CITYSENSE_EXPERIMENT_OVERRIDE;
  } else {
    process.env.CITYSENSE_EXPERIMENT_OVERRIDE = previous;
  }
});

test("assignRecommendationExperiment honors override in safe mode", () => {
  const previous = process.env.CITYSENSE_EXPERIMENT_OVERRIDE;
  process.env.CITYSENSE_EXPERIMENT_OVERRIDE = "true";

  const assigned = assignRecommendationExperiment({
    ...request,
    experimentVariant: "trust-aware-v1"
  });

  assert.equal(assigned.variant, "trust-aware-v1");

  if (previous === undefined) {
    delete process.env.CITYSENSE_EXPERIMENT_OVERRIDE;
  } else {
    process.env.CITYSENSE_EXPERIMENT_OVERRIDE = previous;
  }
});

test("control experiment records metadata without changing adjusted score", () => {
  const base = trafficCandidate(candidate());
  const [result] = applyRecommendationExperiment(
    [base],
    { name: "recommendation-trust-v1", variant: "control", bucketKey: "user-exp-1" },
    []
  );

  assert.equal(result.adjustedScore, base.adjustedScore);
  assert.equal(result.features.experiment?.variant, "control");
  assert.equal(result.features.experiment?.trustAdjustment, 0);
});

test("trust-aware experiment boosts verified fresh evidence and penalizes weak trend-only items", () => {
  const trusted = trafficCandidate(candidate({ id: "trusted", source: "amap-poi" }));
  const weakTrend = trafficCandidate(
    candidate({
      id: "weak-trend",
      source: "xiaohongshu",
      address: undefined,
      lat: undefined,
      lng: undefined,
      confidence: 48,
      freshnessScore: 40,
      routeEligible: false
    })
  );
  const results = applyRecommendationExperiment(
    [weakTrend, trusted],
    { name: "recommendation-trust-v1", variant: "trust-aware-v1", bucketKey: "user-exp-1" },
    [
      {
        condition: "freshness",
        label: "新鲜",
        score: 78,
        source: "citysense-freshness",
        confidence: 0.8,
        expired: false
      }
    ]
  );

  const trustedResult = results.find((item) => item.id === "trusted");
  const weakResult = results.find((item) => item.id === "weak-trend");

  assert.ok((trustedResult?.features.experiment?.trustAdjustment ?? 0) > 0);
  assert.ok((weakResult?.features.experiment?.trustAdjustment ?? 0) < 0);
  assert.match(weakResult?.features.experiment?.trustReason ?? "", /low-confidence/);
});
