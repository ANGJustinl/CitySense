import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSourceItemForIngest,
  shouldUseLlmNormalizer,
  type LlmIngestNormalizerClient
} from "@/server/ingest/llm-normalizer";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

function rawItem(source: string, overrides: Partial<RawSourceItemDetail> = {}): RawSourceItemDetail {
  return {
    id: `${source}-1`,
    source,
    sourceId: `${source}-remote-1`,
    sourceUrl: `https://example.com/${source}/1`,
    title: "原始标题：今晚咖啡展览快闪",
    content: "静安寺附近今晚有一个咖啡主题快闪和小型插画展，适合单人逛。",
    city: "上海",
    area: "静安",
    status: "new",
    itemType: "venue",
    address: "静安寺附近",
    tags: ["咖啡"],
    trendScore: 62,
    confidence: 58,
    ...overrides
  };
}

test("llm ingest normalizer is enabled for every source by default", () => {
  assert.equal(shouldUseLlmNormalizer("amap-poi"), true);
  assert.equal(shouldUseLlmNormalizer("shanghai-gov"), true);
  assert.equal(shouldUseLlmNormalizer("xiaohongshu"), true);
  assert.equal(shouldUseLlmNormalizer("trends-hub"), true);
});

test("llm ingest normalizer applies validated model output while preserving source identity", async () => {
  let capturedSource: string | undefined;
  const client: LlmIngestNormalizerClient = {
    async normalize(request) {
      capturedSource = request.raw.source;

      return {
        status: "normalized",
        entityType: "event",
        title: "静安咖啡插画快闪",
        description: "静安寺附近的咖啡主题快闪和小型插画展。",
        city: "上海",
        area: "静安",
        address: "静安寺附近",
        startTime: "2026-06-13T19:00:00.000Z",
        endTime: "2026-06-13T22:00:00.000Z",
        tags: ["咖啡", "展览", "静安寺"],
        trendScore: 86,
        confidence: 82,
        popularity: 78,
        quietness: 55,
        priceLevel: 2,
        reason: "正文中明确包含地点、时间和活动主题。"
      };
    }
  };

  const result = await normalizeSourceItemForIngest({
    item: rawItem("amap-poi", {
      imageUrl: "https://store.is.autonavi.com/showpic/amap-poi-1.jpg"
    }),
    sourceKey: "amap-poi:test-1",
    client,
    enabled: true,
    timeoutMs: 1000
  });

  assert.equal(capturedSource, "amap-poi");
  assert.equal(result.status, "llm_normalized");
  assert.equal(result.entity?.sourceKey, "amap-poi:test-1");
  assert.equal(result.entity?.source, "amap-poi");
  assert.equal(result.entity?.sourceUrl, "https://example.com/amap-poi/1");
  assert.equal(result.entity?.imageUrl, "https://store.is.autonavi.com/showpic/amap-poi-1.jpg");
  assert.equal(result.entity?.entityType, "event");
  assert.equal(result.entity?.title, "静安咖啡插画快闪");
  assert.deepEqual(result.entity?.tags, ["咖啡", "展览", "静安寺"]);
  assert.equal(result.entity?.trendScore, 86);
  assert.equal(result.entity?.confidence, 82);
});

test("llm ingest normalizer falls back to deterministic parsing when model output is invalid", async () => {
  const client: LlmIngestNormalizerClient = {
    async normalize() {
      return {
        status: "normalized",
        entityType: "event",
        title: "",
        city: "",
        tags: []
      };
    }
  };

  const result = await normalizeSourceItemForIngest({
    item: rawItem("trends-hub", {
      itemType: "event",
      tags: ["热点"]
    }),
    sourceKey: "trends-hub:test-1",
    client,
    enabled: true,
    timeoutMs: 1000
  });

  assert.equal(result.status, "invalid_payload");
  assert.equal(result.entity?.title, "原始标题：今晚咖啡展览快闪");
  assert.equal(result.entity?.entityType, "event");
  assert.deepEqual(result.entity?.tags, ["热点"]);
});

test("llm ingest normalizer can mark irrelevant raw items as ignored", async () => {
  const client: LlmIngestNormalizerClient = {
    async normalize() {
      return {
        status: "ignored",
        ignoreReason: "不是面向公众的城市活动或地点。"
      };
    }
  };

  const result = await normalizeSourceItemForIngest({
    item: rawItem("shanghai-gov"),
    sourceKey: "shanghai-gov:test-1",
    client,
    enabled: true,
    timeoutMs: 1000
  });

  assert.equal(result.status, "llm_ignored");
  assert.equal(result.entity, null);
  assert.equal(result.ignoreReason, "不是面向公众的城市活动或地点。");
});

test("llm ingest normalizer uses OPENAI_API_BASE when OPENAI_BASE_URL is absent", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousBase = process.env.OPENAI_BASE_URL;
  const previousApiBase = process.env.OPENAI_API_BASE;
  const previousModel = process.env.OPENAI_MODEL;
  const previousFetch = globalThis.fetch;
  let capturedUrl: string | undefined;

  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_BASE = "https://example.test/openai/v1/";
  process.env.OPENAI_MODEL = "test-model";
  globalThis.fetch = (async (input) => {
    capturedUrl = String(input);

    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          status: "normalized",
          entityType: "event",
          title: "静安咖啡快闪",
          description: "静安寺附近的咖啡快闪。",
          city: "上海",
          area: "静安",
          address: "静安寺附近",
          startTime: null,
          endTime: null,
          tags: ["咖啡", "快闪"],
          trendScore: 80,
          confidence: 82,
          priceLevel: null,
          quietness: null,
          popularity: null,
          ignoreReason: null,
          reason: "测试"
        })
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const result = await normalizeSourceItemForIngest({
      item: rawItem("xiaohongshu"),
      sourceKey: "xiaohongshu:api-base-env",
      enabled: true,
      timeoutMs: 1000
    });

    assert.equal(result.status, "llm_normalized");
    assert.equal(capturedUrl, "https://example.test/openai/v1/responses");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBase;
    if (previousApiBase === undefined) delete process.env.OPENAI_API_BASE;
    else process.env.OPENAI_API_BASE = previousApiBase;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
    globalThis.fetch = previousFetch;
  }
});

test("llm ingest normalizer does not keep an unevidenced search area", async () => {
  const client: LlmIngestNormalizerClient = {
    async normalize() {
      return {
        status: "normalized",
        entityType: "event",
        title: "上海体彩好事发生市集",
        description: "市集亮相上海城市定向户外挑战赛。",
        city: "上海",
        area: "静安",
        address: "上海体育场",
        tags: ["市集", "户外", "运动"],
        trendScore: 70,
        confidence: 72
      };
    }
  };

  const result = await normalizeSourceItemForIngest({
    item: rawItem("shanghai-gov", {
      title: "上海体彩好事发生市集亮相2026上海城市定向户外挑战赛",
      content: "活动在上海体育场举行，现场有体彩主题市集和运动互动。",
      area: "静安",
      address: undefined,
      tags: ["市集"]
    }),
    sourceKey: "shanghai-gov:stadium-market",
    client,
    enabled: true,
    timeoutMs: 1000
  });

  assert.equal(result.status, "llm_normalized");
  assert.equal(result.entity?.area, undefined);
});
