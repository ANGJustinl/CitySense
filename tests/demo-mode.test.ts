import assert from "node:assert/strict";
import test from "node:test";
import { isDemoContent, isDemoModeEnabled, isMockSourceName } from "@/server/config/demo-mode";
import { resolveIngestSources } from "@/server/ingest/queue";
import { mockAdapter } from "@/server/sources/adapters/mock.adapter";
import { getSourceAdapters } from "@/server/sources/source-registry";

function withDemoMode(value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env.CITYSENSE_DEMO_MODE;

  if (value === undefined) {
    delete process.env.CITYSENSE_DEMO_MODE;
  } else {
    process.env.CITYSENSE_DEMO_MODE = value;
  }

  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) {
      delete process.env.CITYSENSE_DEMO_MODE;
    } else {
      process.env.CITYSENSE_DEMO_MODE = previous;
    }
  });
}

test("demo mode is disabled unless env explicitly enables it", () =>
  withDemoMode(undefined, () => {
    assert.equal(isDemoModeEnabled(), false);
  }));

test("mock adapters are hidden from default source lists outside demo mode", () =>
  withDemoMode(undefined, () => {
    assert.equal(isMockSourceName("mock-city-signal"), true);
    assert.equal(isMockSourceName("xiaohongshu-mock"), true);
    assert.equal(isMockSourceName("xiaohongshu"), false);

    const sources = getSourceAdapters().map((adapter) => adapter.source);

    assert.ok(!sources.includes("mock-city-signal"));
    assert.ok(!resolveIngestSources().includes("mock-city-signal"));
  }));

test("seed demo rows are treated as demo content outside demo mode", () =>
  withDemoMode(undefined, () => {
    assert.equal(isDemoContent({ source: "xiaohongshu", sourceKey: "demo:seed-jingan-coffee-festival" }), true);
    assert.equal(isDemoContent({ source: "trends-hub", sourceKey: "demo:seed-jingan-gallery-night" }), true);
    assert.equal(isDemoContent({ source: "xiaohongshu", sourceKey: "xiaohongshu:real-note" }), false);
  }));

test("mock adapter only returns data when demo mode is enabled", async () => {
  await withDemoMode(undefined, async () => {
    assert.equal(mockAdapter.status, "not_configured");
    assert.deepEqual(
      await mockAdapter.searchEvents({
        city: "上海",
        keywords: ["咖啡"]
      }),
      []
    );
  });

  await withDemoMode("true", async () => {
    assert.equal(isDemoModeEnabled(), true);
    assert.equal(mockAdapter.status, "active");
    assert.ok(getSourceAdapters().some((adapter) => adapter.source === "mock-city-signal"));
    assert.ok(resolveIngestSources().includes("mock-city-signal"));
    assert.ok(
      (
        await mockAdapter.searchEvents({
          city: "上海",
          keywords: ["咖啡"]
        })
      ).length > 0
    );
  });
});
