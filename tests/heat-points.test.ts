import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeatPoints,
  type HeatMode,
  type HeatPointsInput,
  type HeatRow as DbHeatRow
} from "@/server/recommendation/heat-points";

type RowInput = Partial<DbHeatRow> & Pick<DbHeatRow, "id" | "name">;

function row(input: RowInput): DbHeatRow {
  return {
    lat: 31.23,
    lng: 121.46,
    trendScore: 70,
    qualityScore: 60,
    quietness: 50,
    tags: ["咖啡"],
    source: "amap-poi",
    sourceKey: undefined,
    sourceUrl: undefined,
    area: "静安",
    address: undefined,
    description: undefined,
    priceLevel: 2,
    popularity: 60,
    confidence: 50,
    ...input
  };
}

function input(mode: HeatMode, overrides: Partial<HeatPointsInput> = {}): HeatPointsInput {
  return {
    city: "上海",
    area: undefined,
    mode,
    ...overrides
  };
}

test("pulse mode weight = trendScore*0.6 + qualityScore*0.4", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "A", trendScore: 80, qualityScore: 50 }),
      row({ id: "b", name: "B", trendScore: 40, qualityScore: 90 })
    ],
    input("pulse")
  );

  assert.equal(points.length, 2);
  assert.equal(points[0].weight, 80 * 0.6 + 50 * 0.4); // 68
  assert.equal(points[1].weight, 40 * 0.6 + 90 * 0.4); // 60
});

test("trend mode weight = trendScore", () => {
  const points = buildHeatPoints([row({ id: "a", name: "A", trendScore: 73 })], input("trend"));

  assert.equal(points.length, 1);
  assert.equal(points[0].weight, 73);
});

test("quiet mode uses quietness and skips rows without it", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "A", lat: 31.23, lng: 121.46, quietness: 88 }),
      row({ id: "b", name: "B", lat: 31.30, lng: 121.50, quietness: null }),
      row({ id: "c", name: "C", lat: 31.40, lng: 121.60, quietness: undefined })
    ],
    input("quiet")
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].weight, 88);
});

test("match mode with interests calls taste score and produces per-point weight", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "独立书店", tags: ["书店", "阅读"], quietness: 80 }),
      row({ id: "b", name: "酒吧", tags: ["酒吧", "夜生活"], quietness: 20 })
    ],
    input("match", { interests: ["书店"], mood: "quiet", budget: "low" })
  );

  assert.equal(points.length, 2);
  // 含"书店"标签的候选 taste 应明显高于纯酒吧。
  const bookScore = points.find((p) => p.name === "独立书店")?.weight ?? 0;
  const barScore = points.find((p) => p.name === "酒吧")?.weight ?? 0;
  assert.ok(bookScore > barScore, `书店(${bookScore}) 应高于酒吧(${barScore})`);
});

test("match mode without interests degrades to pulse formula", () => {
  const points = buildHeatPoints(
    [row({ id: "a", name: "A", trendScore: 80, qualityScore: 50 })],
    input("match", { interests: [] })
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].weight, 80 * 0.6 + 50 * 0.4);
});

test("dedupe by sourceUrl keeps highest trendScore", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "A", sourceUrl: "https://x.com/p1", trendScore: 60 }),
      row({ id: "b", name: "B", sourceUrl: "https://x.com/p1", trendScore: 90 })
    ],
    input("trend")
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].name, "B");
});

test("dedupe by name+area+coords keeps highest trendScore", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "Manner 咖啡", area: "静安", lat: 31.23, lng: 121.46, trendScore: 50 }),
      row({ id: "b", name: "Manner 咖啡", area: "静安区", lat: 31.23, lng: 121.46, trendScore: 85 })
    ],
    input("trend")
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].name, "Manner 咖啡");
});

test("dedupe treats 静安 / 静安区 as same area", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "X", area: "静安", lat: 31.23, lng: 121.46 }),
      row({ id: "b", name: "X", area: "静安区", lat: 31.23, lng: 121.46 })
    ],
    input("trend")
  );

  assert.equal(points.length, 1);
});

test("returns POI-level points (no server-side grid aggregation)", () => {
  // 三个点落在同一 ~150m 网格内，但因为空间聚合已交给前端 HexagonLayer，
  // 服务端应返回 3 个独立的 POI 级带权点，而非聚合。
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "A", lat: 31.2300, lng: 121.4600, trendScore: 60 }),
      row({ id: "b", name: "B", lat: 31.2301, lng: 121.4601, trendScore: 70 }),
      row({ id: "c", name: "C", lat: 31.2302, lng: 121.4602, trendScore: 80 })
    ],
    input("trend")
  );

  assert.equal(points.length, 3);
  assert.equal(points[0].weight, 60);
  assert.equal(points[1].weight, 70);
  assert.equal(points[2].weight, 80);
});

test("120-point cap is applied after dedupe", () => {
  const rows: DbHeatRow[] = Array.from({ length: 200 }, (_, index) =>
    row({ id: `r${index}`, name: `点${index}`, lat: 31 + index * 0.001, lng: 121 + index * 0.001 })
  );

  const points = buildHeatPoints(rows, input("trend"));

  assert.ok(points.length <= 120, `应不超过 120，实际 ${points.length}`);
});

test("empty rows returns empty points", () => {
  assert.deepEqual(buildHeatPoints([], input("pulse")), []);
});

test("weight clamps to 100 ceiling", () => {
  const points = buildHeatPoints(
    [row({ id: "a", name: "A", trendScore: 999 })],
    input("trend")
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].weight, 100);
});

test("zero-weight points are filtered out in non-match modes", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "A", lat: 31.23, lng: 121.46, trendScore: 70 }),
      row({ id: "b", name: "B", lat: 31.30, lng: 121.50, trendScore: 0 })
    ],
    input("trend")
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].name, "A");
});

test("points carry lng/lat/name/source metadata", () => {
  const points = buildHeatPoints(
    [row({ id: "a", name: "A", lat: 31.2241, lng: 121.4591, source: "amap-poi" })],
    input("pulse")
  );

  assert.equal(points[0].lng, 121.4591);
  assert.equal(points[0].lat, 31.2241);
  assert.equal(points[0].name, "A");
  assert.equal(points[0].source, "amap-poi");
});

test("points carry category metadata from tags", () => {
  const points = buildHeatPoints(
    [
      row({ id: "a", name: "咖啡店", tags: ["咖啡"] }),
      row({ id: "b", name: "展览", tags: ["展览", "美术馆"], lat: 31.25, lng: 121.48 })
    ],
    input("pulse")
  );

  assert.equal(points[0].category, "coffee");
  assert.equal(points[0].categoryLabel, "咖啡");
  assert.equal(points[1].category, "culture");
  assert.equal(points[1].categoryLabel, "文化");
});
