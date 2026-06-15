import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateHeatPoints,
  buildRouteCorridorHeatPoints,
  distanceToRouteMeters,
  normalizeHeatWeights,
  type HeatRawPoint,
  type HeatRouteGeometry
} from "@/components/city/heat-layer";

const route: HeatRouteGeometry = {
  path: [
    [121.46, 31.23],
    [121.47, 31.23]
  ],
  points: []
};

test("normalizeHeatWeights keeps equal heat weights visible", () => {
  const points = normalizeHeatWeights([
    { lng: 121.46, lat: 31.23, weight: 70, category: "coffee" },
    { lng: 121.47, lat: 31.23, weight: 70, category: "culture" }
  ]);

  assert.equal(points.length, 2);
  assert.ok(points.every((point) => point.value > 50));
  assert.equal(points[0].value, points[1].value);
  assert.equal(points[0].category, "coffee");
  assert.equal(points[1].category, "culture");
});

test("normalizeHeatWeights preserves point detail metadata", () => {
  const points = normalizeHeatWeights([
    {
      lng: 121.46,
      lat: 31.23,
      weight: 82,
      category: "coffee",
      categoryLabel: "咖啡",
      name: "路线咖啡店",
      source: "amap-poi"
    }
  ]);

  assert.equal(points[0].categoryLabel, "咖啡");
  assert.equal(points[0].name, "路线咖啡店");
  assert.equal(points[0].source, "amap-poi");
});

test("aggregateHeatPoints merges nearby same-category points for detail labels", () => {
  const clusters = aggregateHeatPoints(
    [
      {
        lng: 121.46,
        lat: 31.23,
        value: 42,
        category: "coffee",
        categoryLabel: "咖啡",
        name: "低权重点",
        source: "amap-poi"
      },
      {
        lng: 121.461,
        lat: 31.2305,
        value: 90,
        category: "coffee",
        categoryLabel: "咖啡",
        name: "高权重点",
        source: "xiaohongshu"
      }
    ],
    180
  );

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[0].name, "高权重点");
  assert.equal(clusters[0].maxValue, 90);
  assert.ok(clusters[0].value >= 90);
});

test("aggregateHeatPoints keeps different categories in separate clusters", () => {
  const clusters = aggregateHeatPoints(
    [
      { lng: 121.46, lat: 31.23, value: 70, category: "coffee" },
      { lng: 121.4602, lat: 31.2302, value: 80, category: "food" }
    ],
    220
  );

  assert.equal(clusters.length, 2);
  assert.deepEqual(
    clusters.map((cluster) => cluster.category).sort(),
    ["coffee", "food"]
  );
});

test("distanceToRouteMeters measures distance to route segments", () => {
  const distance = distanceToRouteMeters({ lng: 121.465, lat: 31.23 }, route);

  assert.ok(distance < 5, `expected point on route, got ${distance}m`);
});

test("buildRouteCorridorHeatPoints filters isolated points far from all routes", () => {
  const points = buildRouteCorridorHeatPoints(
    [
      { lng: 121.465, lat: 31.2303, weight: 80 },
      { lng: 121.5, lat: 31.27, weight: 100 }
    ],
    [route]
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].lng, 121.465);
});

test("buildRouteCorridorHeatPoints decays same-weight points near corridor edges", () => {
  const near: HeatRawPoint = { lng: 121.465, lat: 31.23, weight: 80 };
  const edge: HeatRawPoint = { lng: 121.465, lat: 31.2377, weight: 80 };
  const points = buildRouteCorridorHeatPoints([near, edge], [route]);

  assert.equal(points.length, 2);
  assert.ok(points[0].value > points[1].value, `${points[0].value} <= ${points[1].value}`);
});

test("buildRouteCorridorHeatPoints falls back to regular normalization without route geometry", () => {
  const points = buildRouteCorridorHeatPoints(
    [
      { lng: 121.465, lat: 31.2303, weight: 80 },
      { lng: 121.5, lat: 31.27, weight: 100 }
    ],
    []
  );

  assert.equal(points.length, 2);
});
