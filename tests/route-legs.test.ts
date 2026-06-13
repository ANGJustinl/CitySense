import assert from "node:assert/strict";
import test from "node:test";
import {
  downsamplePolyline,
  getAmapLegPlan,
  parseAmapPolyline
} from "@/server/maps/amap";
import { planRouteLegs, planRoutesLegs } from "@/server/maps/route-legs";
import type { RecommendedRoute, ScoreBreakdown } from "@/server/recommendation/types";

const breakdown: ScoreBreakdown = {
  taste: 60,
  textRelevance: 50,
  socialTrend: 50,
  freshness: 50,
  distance: 50,
  traffic: 50,
  timeFit: 50,
  novelty: 50,
  actionability: 50,
  userAffinity: 50,
  feedbackPenalty: 0
};

function sampleRoute(overrides: Partial<RecommendedRoute> = {}): RecommendedRoute {
  return {
    id: "route-1",
    title: "上海 即刻路线",
    summary: "A -> B / 30 分钟可达",
    totalScore: 76,
    scoreBreakdown: breakdown,
    traffic: {
      estimatedDurationMinutes: 30,
      mode: "transit",
      provider: "estimated",
      congestion: "smooth"
    },
    sourceSignals: [],
    places: [
      {
        id: "place-a",
        name: "画你漫画",
        type: "venue",
        lat: 31.21,
        lng: 121.47,
        tags: ["漫画"]
      },
      {
        id: "place-b",
        name: "艺术书坊",
        type: "venue",
        lat: 31.24,
        lng: 121.48,
        tags: ["书店"]
      }
    ],
    reason: "测试路线",
    tips: [],
    ...overrides
  };
}

test("parseAmapPolyline parses lng,lat pairs and ignores invalid input", () => {
  assert.deepEqual(parseAmapPolyline("121.45,31.22;121.46,31.23"), [
    [121.45, 31.22],
    [121.46, 31.23]
  ]);
  assert.deepEqual(parseAmapPolyline(""), []);
  assert.deepEqual(parseAmapPolyline([]), []);
  assert.deepEqual(parseAmapPolyline("bad,data;121.46,31.23"), [[121.46, 31.23]]);
});

test("downsamplePolyline keeps endpoints and bounds point count", () => {
  const points = Array.from({ length: 1000 }, (_, index) => [121 + index * 0.001, 31] as [number, number]);
  const sampled = downsamplePolyline(points, 100);

  assert.equal(sampled.length, 100);
  assert.deepEqual(sampled[0], points[0]);
  assert.deepEqual(sampled[99], points[999]);
});

test("getAmapLegPlan parses walking steps and road polyline", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";

  const plan = await getAmapLegPlan(
    {
      city: "上海",
      origin: { lat: 31.224, lng: 121.459 },
      destination: { lat: 31.21, lng: 121.47 },
      mode: "walking"
    },
    async () =>
      new Response(
        JSON.stringify({
          status: "1",
          route: {
            paths: [
              {
                distance: "1200",
                duration: "900",
                steps: [
                  {
                    instruction: "沿泰康路向东步行 200 米",
                    road: "泰康路",
                    distance: "200",
                    duration: "180",
                    polyline: "121.459,31.224;121.461,31.223"
                  },
                  {
                    instruction: "右转进入瑞金二路",
                    road: "瑞金二路",
                    distance: "1000",
                    duration: "720",
                    polyline: "121.461,31.223;121.47,31.21"
                  }
                ]
              }
            ]
          }
        })
      )
  );

  assert.ok(plan);
  assert.equal(plan.durationMinutes, 15);
  assert.equal(plan.distanceMeters, 1200);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].road, "泰康路");
  assert.equal(plan.steps[0].durationMinutes, 3);
  assert.deepEqual(plan.polyline[0], [121.459, 31.224]);
  assert.deepEqual(plan.polyline.at(-1), [121.47, 31.21]);
  assert.deepEqual(plan.transitLines, []);

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});

test("getAmapLegPlan parses transit buslines into transit lines and steps", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";

  const plan = await getAmapLegPlan(
    {
      city: "上海",
      origin: { lat: 31.224, lng: 121.459 },
      destination: { lat: 31.24, lng: 121.48 },
      mode: "transit"
    },
    async () =>
      new Response(
        JSON.stringify({
          status: "1",
          route: {
            transits: [
              {
                distance: "5200",
                duration: "1500",
                segments: [
                  {
                    walking: {
                      distance: "300",
                      duration: "240",
                      steps: [
                        {
                          instruction: "步行至地铁站",
                          polyline: "121.459,31.224;121.46,31.226"
                        }
                      ]
                    },
                    bus: {
                      buslines: [
                        {
                          name: "地铁2号线(浦东国际机场--徐泾东)",
                          duration: "960",
                          distance: "4500",
                          polyline: "121.46,31.226;121.475,31.235;121.48,31.24",
                          departure_stop: { name: "南京西路" },
                          arrival_stop: { name: "南京东路" }
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          }
        })
      )
  );

  assert.ok(plan);
  assert.equal(plan.durationMinutes, 25);
  assert.deepEqual(plan.transitLines, ["地铁2号线(浦东国际机场--徐泾东)"]);
  assert.equal(plan.steps.length, 2);
  assert.match(plan.steps[1].instruction ?? "", /地铁2号线/);
  assert.match(plan.steps[1].instruction ?? "", /南京西路 → 南京东路/);
  assert.equal(plan.polyline.length, 5);

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});

test("planRouteLegs falls back to estimated straight-line legs without realtime traffic", async () => {
  const route = await planRouteLegs(sampleRoute(), {
    city: "上海",
    origin: { lat: 31.224, lng: 121.459 },
    useRealtimeTraffic: false
  });

  assert.ok(route.legs);
  assert.equal(route.legs.length, 2);
  assert.equal(route.legs[0].fromName, "出发点");
  assert.equal(route.legs[0].toName, "画你漫画");
  assert.equal(route.legs[0].provider, "estimated");
  assert.equal(route.legs[0].polyline.length, 2);
  assert.equal(route.legs[1].toPlaceId, "place-b");
  assert.equal(
    route.traffic.estimatedDurationMinutes,
    route.legs[0].durationMinutes + route.legs[1].durationMinutes
  );
  assert.match(route.summary, new RegExp(`${route.traffic.estimatedDurationMinutes} 分钟可达`));
});

test("planRouteLegs uses amap leg plans and sums real durations", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";
  const written: unknown[] = [];

  const route = await planRouteLegs(
    sampleRoute(),
    {
      city: "上海",
      origin: { lat: 31.224, lng: 121.459 },
      useRealtimeTraffic: true
    },
    {
      async fetchLegPlan(input) {
        return {
          durationMinutes: input.destination.lat > 31.22 ? 18 : 9,
          distanceMeters: 2000,
          congestion: "smooth",
          polyline: [
            [input.origin.lng, input.origin.lat],
            [input.destination.lng, input.destination.lat]
          ],
          steps: [{ instruction: "测试步骤", durationMinutes: 5 }],
          transitLines: ["地铁2号线"]
        };
      },
      async readCache() {
        return null;
      },
      async writeCache(input, plan) {
        written.push({ input, plan });
      }
    }
  );

  assert.ok(route.legs);
  assert.equal(route.legs.length, 2);
  assert.equal(route.legs[0].provider, "amap");
  assert.equal(route.legs[0].cacheHit, false);
  assert.deepEqual(route.legs[0].transitLines, ["地铁2号线"]);
  assert.equal(route.traffic.estimatedDurationMinutes, 9 + 18);
  assert.equal(route.traffic.provider, "amap");
  assert.equal(written.length, 2);

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});

test("planRouteLegs reuses cached leg plans with cacheHit", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";
  let fetched = 0;

  const route = await planRouteLegs(
    sampleRoute(),
    {
      city: "上海",
      origin: { lat: 31.224, lng: 121.459 },
      useRealtimeTraffic: true
    },
    {
      async fetchLegPlan() {
        fetched += 1;
        return null;
      },
      async readCache() {
        return {
          durationMinutes: 12,
          distanceMeters: 1500,
          congestion: "smooth",
          polyline: [
            [121.459, 31.224],
            [121.47, 31.21]
          ],
          steps: [],
          transitLines: [],
          capturedAt: "2026-06-11T08:00:00.000Z"
        };
      },
      async writeCache() {}
    }
  );

  assert.equal(fetched, 0);
  assert.ok(route.legs);
  assert.equal(route.legs[0].cacheHit, true);
  assert.equal(route.traffic.cacheHit, true);
  assert.equal(route.traffic.estimatedDurationMinutes, 24);

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});

test("planRoutesLegs leaves routes without origin or coordinates untouched", async () => {
  const noCoordRoute = sampleRoute({
    id: "route-2",
    places: [
      {
        id: "place-c",
        name: "无坐标地点",
        type: "venue",
        tags: []
      }
    ]
  });
  const [withoutOrigin] = await planRoutesLegs([sampleRoute()], { city: "上海" });
  const [withoutCoords] = await planRoutesLegs([noCoordRoute], {
    city: "上海",
    origin: { lat: 31.224, lng: 121.459 }
  });

  assert.equal(withoutOrigin.legs, undefined);
  assert.equal(withoutCoords.legs, undefined);
});
