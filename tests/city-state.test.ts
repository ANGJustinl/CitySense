import assert from "node:assert/strict";
import test from "node:test";
import { __testing as crowdTesting } from "@/server/city-state/crowd";
import { __testing as freshnessTesting } from "@/server/city-state/freshness";
import { __testing as queueTesting } from "@/server/city-state/queue";
import { __testing as sentimentTesting } from "@/server/city-state/sentiment";
import { __testing as snapshotTesting } from "@/server/city-state/snapshots";
import { __testing as weatherTesting } from "@/server/city-state/weather";
import type { WeatherResult } from "@/server/maps/weather";

const now = new Date("2026-06-15T10:00:00.000Z");

test("city-state refresh job id is BullMQ safe", () => {
  const jobId = queueTesting.jobIdFor({
    city: "上海",
    area: "静安",
    requestedBy: "codex-smoke"
  });

  assert.equal(jobId.includes(":"), false);
  assert.match(jobId, /^city-state--/);
});

test("weather condition maps AMap weather and degrades without a result", () => {
  const degraded = weatherTesting.buildWeatherCondition({
    city: "上海",
    weather: null,
    now
  });
  const sunnyWeather: WeatherResult = {
    city: "上海",
    live: {
      city: "上海",
      phenomenon: "晴",
      temperature: "28",
      windDirection: "东南",
      windPower: "3",
      humidity: "62",
      reportTime: now.toISOString()
    },
    forecast: [],
    cachedAt: now.getTime()
  };
  const mapped = weatherTesting.buildWeatherCondition({
    city: "上海",
    area: "静安",
    weather: sunnyWeather,
    now
  });

  assert.equal(degraded.label, "天气未接入");
  assert.equal(degraded.metadata?.degraded, true);
  assert.equal(mapped.label, "适合出行");
  assert.ok(mapped.score >= 75);
  assert.equal(mapped.metadata?.phenomenon, "晴");
});

test("crowd estimator produces stable low and high density labels", () => {
  const low = crowdTesting.estimateCrowdCondition({
    city: "上海",
    venues: [{ popularity: 20, quietness: 86 }],
    events: [{ trendScore: 20 }],
    citySignals: [{ heatScore: 18 }],
    trafficSnapshots: [{ congestion: "smooth" }],
    now
  });
  const high = crowdTesting.estimateCrowdCondition({
    city: "上海",
    venues: [{ popularity: 92, quietness: 15 }],
    events: [{ trendScore: 88 }],
    citySignals: [{ heatScore: 94 }],
    trafficSnapshots: [{ congestion: "busy" }],
    now
  });

  assert.equal(low.label, "低密度");
  assert.equal(high.label, "人流偏高");
  assert.ok(high.score > low.score);
});

test("sentiment uses rules, accepts valid LLM enhancement, and falls back on timeout", async () => {
  const samples = [
    { tag: "安静书店", heatScore: 80, source: "xiaohongshu" },
    { tag: "艺术展览", heatScore: 70, source: "shanghai-gov" }
  ];
  const rule = sentimentTesting.estimateRuleBasedSentiment({
    city: "上海",
    samples,
    now
  });
  const enhanced = await sentimentTesting.resolveSentimentCondition(
    {
      city: "上海",
      samples,
      now
    },
    {
      minSampleCount: 1,
      client: {
        async classify() {
          return {
            label: "hyped",
            score: 84,
            confidence: 0.88,
            reason: "市集和演出热度更强"
          };
        }
      }
    }
  );
  const fallback = await sentimentTesting.resolveSentimentCondition(
    {
      city: "上海",
      samples,
      now
    },
    {
      minSampleCount: 1,
      timeoutMs: 1,
      client: {
        async classify() {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            label: "noisy",
            score: 90,
            confidence: 0.9
          };
        }
      }
    }
  );

  assert.equal(rule.metadata?.label, "calm");
  assert.equal(enhanced.source, "citysense-sentiment-llm");
  assert.equal(enhanced.metadata?.label, "hyped");
  assert.equal(fallback.source, "citysense-sentiment-rules");
});

test("freshness and snapshot summaries prefer current area-specific conditions", () => {
  const fresh = freshnessTesting.buildFreshnessCondition({
    city: "上海",
    area: "静安",
    sources: [
      {
        name: "city-signals",
        latestAt: new Date(now.getTime() - 12 * 60_000),
        count: 3
      }
    ],
    now
  });
  const summaries = snapshotTesting.summarizeConditionSnapshots(
    [
      {
        ...fresh,
        area: undefined,
        label: "城市级较新",
        capturedAt: new Date(now.getTime() - 5 * 60_000),
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      },
      {
        ...fresh,
        label: "静安刚刷新",
        capturedAt: new Date(now.getTime() - 12 * 60_000),
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      },
      {
        ...fresh,
        condition: "weather",
        label: "过期天气",
        capturedAt: new Date(now.getTime() - 120 * 60_000),
        expiresAt: new Date(now.getTime() - 60_000)
      }
    ],
    {
      area: "静安",
      now: now.getTime()
    }
  );

  assert.equal(fresh.label, "刚刷新");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].label, "静安刚刷新");
  assert.equal(summaries[0].expired, false);
});
