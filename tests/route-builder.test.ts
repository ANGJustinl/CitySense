import assert from "node:assert/strict";
import test from "node:test";
import { buildRoutes, buildRoutesWithMeta } from "@/server/recommendation/route-builder";
import { scoreCandidate } from "@/server/recommendation/scoring";
import type {
  Candidate,
  RecommendInput,
  TrafficCandidate
} from "@/server/recommendation/types";

const baseInput: RecommendInput = {
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

function candidate(
  id: string,
  tags: string[],
  lat: number,
  lng: number,
  score = 80
): Candidate {
  return {
    id,
    name: `候选 ${id}`,
    type: id.includes("event") ? "event" : "venue",
    city: "上海",
    area: "静安",
    address: `${id} 号路`,
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

function trafficCandidate(base: Candidate, score = 80): TrafficCandidate {
  const scored = scoreCandidate(base, baseInput);

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

// 生成 n 个分散在静安周边的候选，避免被 samePlaceCluster / 地址去重误杀。
function makeCandidates(n: number): TrafficCandidate[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `place-${i + 1}`;
    return trafficCandidate(
      candidate(id, ["咖啡", "展览"], 31.22 + i * 0.003, 121.459 + i * 0.003, 90 - i)
    );
  });
}

test("waypointCount=6 with a large pool produces routes of exactly 6 places", () => {
  const input = { ...baseInput, waypointCount: 6 };
  const routes = buildRoutes(makeCandidates(20), input);

  assert.ok(routes.length > 0, "should produce at least one route");
  for (const route of routes) {
    assert.equal(route.places.length, 6, "each route should have exactly 6 waypoints");
  }
});

test("waypointCount=6 with only 4 candidates clamps to 4 places (no single-point fallback)", () => {
  // 修复的核心场景：用户要 6 点但候选只有 4 个。
  // 修复前：generateRouteGroups 产出 0 组 → 退化为单点路线。
  // 修复后：effectiveSize = min(6, 4) = 4，产出 4 点路线。
  const input = { ...baseInput, waypointCount: 6 };
  const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(4), input);

  assert.equal(appliedWaypointCount, 4, "should clamp to 4, not degrade to 1");
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.ok(
      route.places.length <= 4,
      "no route should exceed the available candidate count"
    );
    assert.ok(
      route.places.length >= 2,
      "should not collapse to a single-point route when 2+ candidates exist"
    );
  }
});

test("each requested size 2-6 produces routes bounded by that size", () => {
  const pool = makeCandidates(20);

  for (const size of [2, 3, 4, 5, 6] as const) {
    const input = { ...baseInput, waypointCount: size };
    const { routes, appliedWaypointCount } = buildRoutesWithMeta(pool, input);

    assert.equal(
      appliedWaypointCount,
      size,
      `appliedWaypointCount should be ${size} when pool is large enough`
    );
    assert.ok(routes.length > 0, `size=${size} should yield routes`);
    for (const route of routes) {
      assert.equal(route.places.length, size, `size=${size} route should have ${size} places`);
    }
  }
});

test("waypointCount clamps one-by-one as the candidate pool shrinks", () => {
  // 验证 clamping 边界：请求 6 点，候选从 6 降到 2，每档都应 clamp 到实际可用数。
  for (const poolSize of [6, 5, 4, 3, 2]) {
    const input = { ...baseInput, waypointCount: 6 };
    const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(poolSize), input);

    assert.equal(
      appliedWaypointCount,
      poolSize,
      `pool=${poolSize} should clamp to exactly ${poolSize}, not 1`
    );
    for (const route of routes) {
      assert.ok(
        route.places.length <= poolSize,
        `pool=${poolSize} route must not exceed ${poolSize} places`
      );
    }
  }
});

test("undefined waypointCount falls back to legacy pairs/triples (zero regression)", () => {
  // 未指定 waypointCount 时走原 pairs + 可选 triples 路径，
  // appliedWaypointCount 为 null，每条路线 2-3 个地点。
  const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(20), baseInput);

  assert.equal(appliedWaypointCount, null, "should report null when waypointCount is unspecified");
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.ok(
      route.places.length >= 2 && route.places.length <= 3,
      "legacy path yields 2-3 place routes"
    );
  }
});

test("waypointCount=6 with a single candidate degrades to a single-point route", () => {
  // 候选池连两点都凑不齐 → 唯一允许的单点兜底。
  const input = { ...baseInput, waypointCount: 6 };
  const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(1), input);

  assert.equal(appliedWaypointCount, 1, "should report 1 when only one candidate exists");
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.equal(route.places.length, 1, "single-candidate pool yields single-point routes");
  }
});

test("combination generator terminates and yields routes for a large pool", () => {
  // 防回归：足够大候选池下组合生成不应无限循环、不应漏组合。
  // 用 size=3 + 20 候选（理论 C(20,3)=1140 组），只要能正常返回即说明循环终止正确。
  const input = { ...baseInput, waypointCount: 3 };
  const start = Date.now();
  const routes = buildRoutes(makeCandidates(20), input);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 5000, "combination generation should terminate quickly");
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.equal(route.places.length, 3);
  }
});

test("route places are unique within each route", () => {
  const input = { ...baseInput, waypointCount: 4 };
  const routes = buildRoutes(makeCandidates(12), input);

  for (const route of routes) {
    const ids = route.places.map((place) => place.id);
    assert.equal(new Set(ids).size, ids.length, "places within a route must be unique");
  }
});
