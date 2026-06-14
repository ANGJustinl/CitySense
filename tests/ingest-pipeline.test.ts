import assert from "node:assert/strict";
import test from "node:test";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import { createSourceKey } from "@/server/ingest/source-key";
import { buildCitySignalRows, toNormalizedEntityInput } from "@/server/ingest/normalize";
import { __testing as pipelineTesting } from "@/server/ingest/pipeline";
import { applySourceResult, createEmptyIngestStats } from "@/server/ingest/types";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const sampleItem: RawSourceItemDetail = {
  id: "sample-1",
  source: "mock-city-signal",
  sourceId: "source-1",
  sourceUrl: "https://example.com/source-1",
  title: "静安夜间展览",
  content: "小型展览和咖啡联动",
  city: "上海",
  area: "静安",
  publishedAt: "2026-06-06T10:00:00.000Z",
  status: "new",
  itemType: "event",
  address: "愚园路 300 号",
  lat: 31.226,
  lng: 121.447,
  startsAt: "2026-06-06T12:00:00.000Z",
  tags: ["展览", "咖啡"],
  trendScore: 72,
  confidence: 86
};

test("source key prefers source id and stays stable", () => {
  assert.equal(createSourceKey(sampleItem), "mock-city-signal:source-1");
});

test("source key falls back to stable hash when source id is missing", () => {
  const first = createSourceKey({ ...sampleItem, sourceId: undefined });
  const second = createSourceKey({ ...sampleItem, sourceId: undefined });

  assert.equal(first, second);
  assert.match(first, /^mock-city-signal:[a-f0-9]{24}$/);
});

test("base adapter returns standard not_configured state", async () => {
  const previous = process.env.TEST_CITY_SOURCE_KEY;
  delete process.env.TEST_CITY_SOURCE_KEY;

  class TestAdapter extends BaseCitySourceAdapter {
    constructor() {
      super({
        source: "test-source",
        kind: "api",
        enabledByDefault: true,
        requiredEnvVars: ["TEST_CITY_SOURCE_KEY"]
      });
    }

    protected async searchVenuesImpl() {
      return [sampleItem];
    }
  }

  const adapter = new TestAdapter();
  assert.equal(adapter.status, "not_configured");
  assert.deepEqual(await adapter.searchVenues({ city: "上海", keywords: ["展览"] }), []);

  process.env.TEST_CITY_SOURCE_KEY = "ready";
  assert.equal(adapter.status, "active");
  assert.equal((await adapter.searchVenues({ city: "上海", keywords: ["展览"] })).length, 1);

  if (previous === undefined) {
    delete process.env.TEST_CITY_SOURCE_KEY;
  } else {
    process.env.TEST_CITY_SOURCE_KEY = previous;
  }
});

test("raw source item maps to normalized event input", () => {
  const normalized = toNormalizedEntityInput(sampleItem, createSourceKey(sampleItem));

  assert.ok(normalized);
  assert.equal(normalized.entityType, "event");
  assert.equal(normalized.title, "静安夜间展览");
  assert.equal(normalized.city, "上海");
  assert.equal(normalized.trendScore, 72);
  assert.deepEqual(normalized.tags, ["展览", "咖啡"]);
});

test("normalized entity input canonicalizes Shanghai district suffixes", () => {
  const normalized = toNormalizedEntityInput(
    {
      ...sampleItem,
      area: "静安区"
    },
    createSourceKey(sampleItem)
  );

  assert.ok(normalized);
  assert.equal(normalized.area, "静安");
});

test("city signal rows use LLM-normalized tags and score when provided", () => {
  const normalized = toNormalizedEntityInput(sampleItem, createSourceKey(sampleItem));

  assert.ok(normalized);

  const rows = buildCitySignalRows(sampleItem, createSourceKey(sampleItem), "event-1", {
    ...normalized,
    tags: ["插画展", "夜间活动", "咖啡"],
    trendScore: 88,
    confidence: 90
  });

  assert.deepEqual(
    rows.map((row) => `${row.tag}:${row.heatScore}`),
    ["插画展:88", "夜间活动:88", "咖啡:88"]
  );
});

test("event upsert update data clears stale nullable fields", () => {
  const normalized = toNormalizedEntityInput(
    {
      ...sampleItem,
      area: undefined,
      address: undefined,
      startsAt: undefined,
      sourceUrl: undefined
    },
    createSourceKey(sampleItem)
  );

  assert.ok(normalized);

  const data = pipelineTesting.eventDataForEntity(normalized);

  assert.equal(data.update.area, null);
  assert.equal(data.update.address, null);
  assert.equal(data.update.startTime, null);
  assert.equal(data.update.sourceUrl, null);
  assert.equal(data.update.imageUrl, null);
  assert.equal(data.update.imageSource, null);
});

test("event and venue upsert data carry image url with image source attribution", () => {
  const normalized = toNormalizedEntityInput(
    {
      ...sampleItem,
      imageUrl: "https://store.is.autonavi.com/showpic/sample.jpg"
    },
    createSourceKey(sampleItem)
  );

  assert.ok(normalized);

  const eventData = pipelineTesting.eventDataForEntity(normalized);

  assert.equal(eventData.update.imageUrl, "https://store.is.autonavi.com/showpic/sample.jpg");
  assert.equal(eventData.update.imageSource, "mock-city-signal");

  const venueData = pipelineTesting.venueDataForEntity({
    ...normalized,
    entityType: "venue"
  });

  assert.equal(venueData.update.imageUrl, "https://store.is.autonavi.com/showpic/sample.jpg");
  assert.equal(venueData.update.imageSource, "mock-city-signal");
});

test("raw source item record can be restored for deferred normalization", () => {
  const rawRecord = {
    id: "raw-1",
    source: "damai",
    sourceKey: "damai:event-1",
    sourceId: "event-1",
    sourceUrl: "https://detail.damai.cn/item.htm?id=event-1",
    title: "东方风云榜",
    content: "演出时间 2026-06-20",
    author: null,
    rawPayload: { sourceId: "event-1" },
    parsedPayload: {
      id: "event-1",
      source: "damai",
      sourceId: "event-1",
      sourceUrl: "https://detail.damai.cn/item.htm?id=event-1",
      title: "东方风云榜",
      content: "演出时间 2026-06-20",
      city: "上海",
      area: "浦东",
      publishedAt: "2026-06-14T00:00:00.000Z",
      status: "new",
      itemType: "event",
      startsAt: "2026-06-20T11:30:00.000Z",
      imageUrl: "https://img.alicdn.com/event.jpg",
      tags: ["演唱会", "演出"],
      trendScore: 86,
      confidence: 82,
      rawPayload: {
        venueName: "梅赛德斯-奔驰文化中心",
        priceText: "380-1280元"
      },
      sourceSignals: [
        {
          source: "damai",
          label: "大麦热度",
          score: 86,
          evidence: "售票中"
        }
      ]
    },
    city: "上海",
    area: "浦东",
    publishedAt: new Date("2026-06-14T00:00:00.000Z"),
    status: "new",
    itemType: "event",
    normalizedEntityType: null,
    normalizedEntityId: null,
    ingestRunId: "run-1",
    firstSeenAt: new Date("2026-06-14T00:00:00.000Z"),
    lastSeenAt: new Date("2026-06-14T00:00:00.000Z"),
    createdAt: new Date("2026-06-14T00:00:00.000Z")
  };

  const restored = pipelineTesting.rawSourceItemDetailFromRecord(rawRecord);

  assert.ok(restored);
  assert.equal(restored.source, "damai");
  assert.equal(restored.itemType, "event");
  assert.equal(restored.startsAt, "2026-06-20T11:30:00.000Z");
  assert.equal(restored.imageUrl, "https://img.alicdn.com/event.jpg");
  assert.deepEqual(restored.tags, ["演唱会", "演出"]);
  assert.equal(restored.sourceSignals?.[0]?.label, "大麦热度");
});

test("raw ingest stats can finish before deferred normalization", () => {
  const stats = applySourceResult(createEmptyIngestStats(1), {
    source: "damai",
    status: "completed",
    fetched: 6,
    rawUpserted: 6,
    normalized: 0,
    citySignalsCreated: 0
  });

  assert.equal(stats.sourcesCompleted, 1);
  assert.equal(stats.rawUpserted, 6);
  assert.equal(stats.normalized, 0);
  assert.equal(stats.citySignalsCreated, 0);
});

test("ingest stats aggregate source results", () => {
  const stats = createEmptyIngestStats(2);
  const afterSuccess = applySourceResult(stats, {
    source: "mock-city-signal",
    status: "completed",
    fetched: 2,
    rawUpserted: 2,
    normalized: 2,
    citySignalsCreated: 4
  });
  const afterFailure = applySourceResult(afterSuccess, {
    source: "douban",
    status: "failed",
    fetched: 0,
    rawUpserted: 0,
    normalized: 0,
    citySignalsCreated: 0,
    error: "not_configured"
  });

  assert.equal(afterFailure.sourcesRequested, 2);
  assert.equal(afterFailure.sourcesCompleted, 1);
  assert.equal(afterFailure.sourcesFailed, 1);
  assert.equal(afterFailure.normalized, 2);
  assert.deepEqual(afterFailure.errors, ["douban: not_configured"]);
});
