import assert from "node:assert/strict";
import test from "node:test";
import { demoSeedCatalog } from "@/prisma/demo-seed-data";
import { toNormalizedEntityInput } from "@/server/ingest/normalize";
import { createSourceKey } from "@/server/ingest/source-key";

test("demo seed catalog covers P0 city data requirements", () => {
  assert.ok(demoSeedCatalog.length >= 20);

  const areas = new Set(demoSeedCatalog.map((item) => item.area));
  for (const area of ["徐汇", "静安", "长宁", "黄浦", "浦东"]) {
    assert.ok(areas.has(area), `missing area ${area}`);
  }

  const sources = new Set(demoSeedCatalog.map((item) => item.source));
  for (const source of ["xiaohongshu", "douban", "bilibili", "amap-poi"]) {
    assert.ok(sources.has(source), `missing source ${source}`);
  }

  assert.ok(demoSeedCatalog.some((item) => item.itemType === "event"));
  assert.ok(demoSeedCatalog.some((item) => item.itemType === "venue"));
});

test("demo seed catalog items have traceable recommendation fields", () => {
  for (const item of demoSeedCatalog) {
    assert.equal(item.city, "上海");
    assert.ok(item.id);
    assert.ok(item.title);
    assert.ok(item.area);
    assert.ok(item.address);
    assert.equal(typeof item.lat, "number");
    assert.equal(typeof item.lng, "number");
    assert.ok(item.source);
    assert.ok(item.sourceUrl);
    assert.ok(item.tags.length >= 2);
    assert.ok((item.trendScore ?? 0) > 0);
    assert.ok((item.confidence ?? 0) > 0);
    assert.ok(item.sourceSignals?.length);
  }
});

test("demo seed catalog can flow through normalized entity mapping", () => {
  const normalized = demoSeedCatalog.map((item) => {
    const entity = toNormalizedEntityInput(item, createSourceKey(item));
    assert.ok(entity);
    return entity;
  });

  assert.equal(normalized.length, demoSeedCatalog.length);
  assert.ok(normalized.some((item) => item.entityType === "event"));
  assert.ok(normalized.some((item) => item.entityType === "venue"));
});
