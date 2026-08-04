import assert from "node:assert/strict";
import test from "node:test";
import {
  __testing as momentTesting
} from "@/server/recommendation/moment-fit";
import type {
  RecommendedRoute,
  RecommendInput,
  ScoreBreakdown,
  TrafficCandidate
} from "@/server/recommendation/types";
import type { CityConditionSummary } from "@/server/city-state/types";

const now = new Date("2026-06-15T10:00:00.000Z").getTime();

const breakdown: ScoreBreakdown = {
  taste: 80,
  textRelevance: 80,
  socialTrend: 80,
  freshness: 80,
  distance: 80,
  traffic: 80,
  timeFit: 80,
  novelty: 80,
  actionability: 80,
  userAffinity: 50,
  feedbackPenalty: 0,
  exposurePenalty: 0
};

const input: RecommendInput = {
  city: "上海",
  interests: ["展览"],
  mood: "quiet",
  budget: "medium",
  timeWindow: "now",
  useRealtimeTraffic: true,
  useSocialSignals: true
};

function candidate(overrides: Partial<TrafficCandidate>): TrafficCandidate {
  return {
    id: "event-a",
    name: "活动 A",
    type: "event",
    city: "上海",
    area: "静安",
    address: "南京西路 1 号",
    lat: 31.22,
    lng: 121.45,
    tags: ["展览"],
    trendScore: 80,
    confidence: 80,
    freshnessScore: 80,
    popularity: 80,
    quietness: 50,
    priceLevel: 2,
    source: "shanghai-gov",
    sourceSignals: [],
    baseScore: 80,
    scoreBreakdown: breakdown,
    features: {
      candidateId: "event-a",
      ...breakdown
    },
    ranker: "weighted-v1",
    rankerVersion: "test",
    traffic: {
      estimatedDurationMinutes: 20,
      mode: "transit",
      provider: "estimated"
    },
    adjustedScore: 80,
    ...overrides
  };
}

function condition(
  condition: CityConditionSummary["condition"],
  label: string,
  score: number,
  metadata: Record<string, unknown> = {}
): CityConditionSummary {
  return {
    condition,
    label,
    score,
    source: `citysense-${condition}`,
    confidence: 0.8,
    capturedAt: new Date(now - 5 * 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
    ageMinutes: 5,
    expired: false,
    metadata
  };
}

function route(overrides: Partial<RecommendedRoute> = {}): RecommendedRoute {
  return {
    id: "route-1",
    title: "静安 即刻路线",
    summary: "活动 A -> 咖啡 B / 20 分钟可达",
    totalScore: 84,
    scoreBreakdown: breakdown,
    traffic: {
      estimatedDurationMinutes: 20,
      mode: "transit",
      provider: "amap",
      congestion: "smooth"
    },
    sourceSignals: [
      {
        source: "xiaohongshu",
        label: "讨论热度",
        score: 88
      }
    ],
    places: [
      {
        id: "event-a",
        name: "活动 A",
        type: "event",
        address: "南京西路 1 号",
        lat: 31.22,
        lng: 121.45,
        tags: ["展览"],
        source: "xiaohongshu",
        startsAt: new Date(now + 30 * 60_000).toISOString(),
        endsAt: new Date(now + 3 * 60 * 60_000).toISOString()
      }
    ],
    reason: "测试",
    tips: [],
    ...overrides
  };
}

test("moment hard filter removes ended and impossible event candidates", () => {
  const ended = candidate({
    id: "ended",
    endsAt: new Date(now - 60_000).toISOString()
  });
  const impossible = candidate({
    id: "impossible",
    traffic: {
      estimatedDurationMinutes: 40,
      mode: "transit",
      provider: "estimated"
    },
    endsAt: new Date(now + 10 * 60_000).toISOString()
  });
  const feasible = candidate({
    id: "feasible",
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString()
  });

  const filtered = momentTesting.filterMomentImpossibleCandidates([ended, impossible, feasible], now);

  assert.deepEqual(filtered.map((item) => item.id), ["feasible"]);
});

test("moment rerank only lightly adjusts feasible candidates", () => {
  const outdoor = candidate({
    id: "outdoor",
    tags: ["市集", "户外"],
    adjustedScore: 80,
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString()
  });
  const indoor = candidate({
    id: "indoor",
    tags: ["书店", "安静"],
    adjustedScore: 78,
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString()
  });
  const reranked = momentTesting.rerankCandidatesByMoment(
    [outdoor, indoor],
    input,
    [
      condition("weather", "天气扰动", 30),
      condition("crowd", "相对宽松", 36),
      condition("sentiment", "偏松弛", 76, { label: "calm" })
    ],
    now
  );

  assert.equal(reranked[0].id, "indoor");
  assert.ok(Math.abs(reranked[0].adjustedScore - 83) <= 1);
});

test("weather with rain-level score lightly penalizes outdoor candidates", () => {
  const outdoor = candidate({
    id: "outdoor",
    tags: ["市集", "户外"],
    adjustedScore: 80,
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString()
  });
  const indoor = candidate({
    id: "indoor",
    tags: ["书店", "安静"],
    adjustedScore: 78,
    endsAt: new Date(now + 2 * 60 * 60_000).toISOString()
  });
  const reranked = momentTesting.rerankCandidatesByMoment(
    [outdoor, indoor],
    input,
    [condition("weather", "天气一般", 52)],
    now
  );

  assert.equal(reranked[0].id, "indoor");
  assert.equal(reranked.find((item) => item.id === "outdoor")?.adjustedScore, 77);
});

test("route moment context carries why-now facts and source caveats", () => {
  const [withMoment] = momentTesting.attachMomentContextToRoutes(
    [route()],
    input,
    [
      condition("weather", "适合出行", 82),
      condition("crowd", "热度适中", 60),
      condition("sentiment", "热度上扬", 80, { label: "hyped" }),
      condition("freshness", "刚刷新", 94)
    ],
    now
  );

  assert.equal(withMoment.momentFit?.arrivalFit, "fits");
  assert.match(withMoment.momentFit?.whyNow ?? "", /适合进入路线/);
  assert.ok(withMoment.momentFit?.facts.some((fact) => fact.label === "天气"));
  assert.ok(withMoment.evidence?.caveats.includes("小红书只作为趋势证据，不作为地点权威。"));
  assert.equal(withMoment.evidence?.signalRoles.some((role) => role.role === "traffic_eta"), true);
});

test("degraded weather condition is visible but does not claim weather fit", () => {
  const [withMoment] = momentTesting.attachMomentContextToRoutes(
    [route()],
    input,
    [
      condition("weather", "天气未接入", 50, {
        degraded: true
      })
    ],
    now
  );

  assert.equal(withMoment.momentFit?.weatherFit, "unknown");
  assert.ok(withMoment.momentFit?.facts.some((fact) => fact.label === "天气" && fact.value === "天气未接入"));
});
