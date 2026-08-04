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

test("waypointCount=6 with a large pool produces routes up to 6 places", () => {
  const input = { ...baseInput, waypointCount: 6 };
  const routes = buildRoutes(makeCandidates(20), input);

  assert.ok(routes.length > 0, "should produce at least one route");
  // prod 在 maxSize(6) 到 minSize(2) 区间生成组合，最多 6 点。
  const maxPlaces = Math.max(...routes.map((r) => r.places.length));
  assert.ok(maxPlaces <= 6, "no route should exceed 6 waypoints");
  assert.ok(maxPlaces >= 2, "should produce multi-place routes");
});

test("waypointCount=6 with only 4 candidates clamps (no single-point fallback)", () => {
  // 修复的核心场景：用户要 6 点但候选只有 4 个。
  // 修复前（旧 generateRouteGroups）：产出 0 组 → 退化为单点路线。
  // prod 的实现：maxSize = min(6, 4) = 4，生成 2-4 点路线组合，绝不退化为单点。
  const input = { ...baseInput, waypointCount: 6 };
  const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(4), input);

  // appliedWaypointCount 取众数，应 <= 4（受候选池限制），且 >= 2（非单点）。
  assert.ok(
    appliedWaypointCount !== null && appliedWaypointCount <= 4,
    `should clamp to <= 4, got ${appliedWaypointCount}, not degrade to single-point`
  );
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

    // prod 在 [2, size] 区间生成组合，appliedWaypointCount 取众数，应 <= size。
    assert.ok(
      appliedWaypointCount !== null && appliedWaypointCount <= size,
      `size=${size} appliedWaypointCount=${appliedWaypointCount} should be <= ${size}`
    );
    assert.ok(routes.length > 0, `size=${size} should yield routes`);
    for (const route of routes) {
      assert.ok(
        route.places.length <= size,
        `size=${size} route should have at most ${size} places, got ${route.places.length}`
      );
      assert.ok(route.places.length >= 2, `size=${size} route should have >= 2 places`);
    }
  }
});

test("waypointCount clamps one-by-one as the candidate pool shrinks", () => {
  // 验证 clamping 边界：请求 6 点，候选池缩小时实际途径点应 <= 候选数，
  // 绝不退化为单点（除非候选 <2）。
  for (const poolSize of [6, 5, 4, 3, 2]) {
    const input = { ...baseInput, waypointCount: 6 };
    const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(poolSize), input);

    // appliedWaypointCount 取结果路线地点数的众数，应 <= poolSize 且 >= 2。
    assert.ok(
      appliedWaypointCount !== null && appliedWaypointCount <= poolSize,
      `pool=${poolSize} appliedWaypointCount=${appliedWaypointCount} should be <= ${poolSize}, not single-point`
    );
    for (const route of routes) {
      assert.ok(
        route.places.length <= poolSize,
        `pool=${poolSize} route must not exceed ${poolSize} places`
      );
      assert.ok(
        route.places.length >= 2,
        `pool=${poolSize} should not collapse to single-point route`
      );
    }
  }
});

test("undefined waypointCount uses pipeline default (2-3 places per route)", () => {
  // 未显式指定 waypointCount 时，prod 的 desiredWaypointCount 回退到 DEFAULT_WAYPOINT_COUNT(3)，
  // 生成 2-3 点路线（maxSize=3, minSize=2）。appliedWaypointCount 反映实际众数，非 null。
  const { routes, appliedWaypointCount } = buildRoutesWithMeta(makeCandidates(20), baseInput);

  assert.ok(appliedWaypointCount !== null, "should report an actual count, not null");
  assert.ok(
    appliedWaypointCount! >= 2 && appliedWaypointCount! <= 3,
    `default path yields 2-3 place routes, got ${appliedWaypointCount}`
  );
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.ok(
      route.places.length >= 2 && route.places.length <= 3,
      "default path yields 2-3 place routes"
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
  // prod 在 [2, maxSize=3] 区间生成，每条路线 2-3 个地点。
  const maxPlaces = Math.max(...routes.map((r) => r.places.length));
  assert.ok(maxPlaces <= 3 && maxPlaces >= 2, "size=3 yields 2-3 place routes");
});

test("route places are unique within each route", () => {
  const input = { ...baseInput, waypointCount: 4 };
  const routes = buildRoutes(makeCandidates(12), input);

  for (const route of routes) {
    const ids = route.places.map((place) => place.id);
    assert.equal(new Set(ids).size, ids.length, "places within a route must be unique");
  }
});
