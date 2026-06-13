import assert from "node:assert/strict";
import test from "node:test";
import type { RecommendedRoute } from "@/server/recommendation/types";
import {
  buildRouteMapView,
  createRouteSnapshotId,
  parseRouteSnapshotId,
  withRouteSnapshotIds
} from "@/server/routes/route-detail";

const sampleRoute: RecommendedRoute = {
  id: "route-1",
  title: "上海 即刻路线",
  summary: "A -> B / 20 分钟可达",
  totalScore: 88,
  scoreBreakdown: {
    taste: 90,
    textRelevance: 78,
    socialTrend: 80,
    freshness: 70,
    distance: 85,
    traffic: 92,
    timeFit: 88,
    novelty: 76,
    userAffinity: 50,
    feedbackPenalty: 0
  },
  traffic: {
    estimatedDurationMinutes: 20,
    mode: "transit",
    provider: "amap",
    congestion: "smooth"
  },
  sourceSignals: [],
  places: [
    {
      id: "place-a",
      name: "A",
      type: "event",
      address: "A 路 1 号",
      lat: 31.2,
      lng: 121.4,
      tags: ["展览"]
    },
    {
      id: "place-b",
      name: "B",
      type: "venue",
      address: "B 路 2 号",
      lat: 31.22,
      lng: 121.46,
      tags: ["咖啡"]
    },
    {
      id: "place-c",
      name: "C",
      type: "venue",
      tags: ["书店"]
    }
  ],
  reason: "测试路线",
  tips: []
};

test("route snapshot id can be created and parsed", () => {
  const id = createRouteSnapshotId("rec_123", "route-1");

  assert.equal(id, "rec_123__route-1");
  assert.deepEqual(parseRouteSnapshotId(id), {
    recommendationId: "rec_123",
    routeLocalId: "route-1"
  });
});

test("invalid route snapshot id is rejected", () => {
  assert.equal(parseRouteSnapshotId("route-1"), null);
  assert.equal(parseRouteSnapshotId("rec__"), null);
});

test("recommendation routes can be decorated with snapshot ids", () => {
  const [route] = withRouteSnapshotIds("rec_123", [sampleRoute]);

  assert.equal(route.id, "rec_123__route-1");
  assert.equal(route.title, sampleRoute.title);
});

test("route map view keeps valid coordinates in lng/lat order", () => {
  const map = buildRouteMapView(sampleRoute);

  assert.deepEqual(map.polyline, [
    [121.4, 31.2],
    [121.46, 31.22]
  ]);
  assert.deepEqual(map.center, [121.43, 31.21]);
  assert.equal(map.markers.length, 2);
  assert.equal(map.markers[0].index, 1);
  assert.equal(map.markers[1].name, "B");
  assert.deepEqual(map.bounds, {
    southWest: [121.4, 31.2],
    northEast: [121.46, 31.22]
  });
});
