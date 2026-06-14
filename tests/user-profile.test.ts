import assert from "node:assert/strict";
import test from "node:test";
import {
  PROFILE_WEIGHT_CAP,
  PROFILE_VERSION,
  type ProfileSignal,
  type UserProfileSnapshot
} from "@/server/recommendation/profile.types";
import {
  buildSnapshot,
  candidateDimensionKeys,
  computeProfileWeights,
  computeRecentExposure,
  computeTopReasons,
  countExposureHits,
  decay,
  decayNegativeVenue,
  extractProfileFactors,
  topNegativeFactors,
  topPositiveFactors
} from "@/server/recommendation/user-profile-core";
import {
  buildProfileMeta,
  isSnapshotStale,
  parseProfileSnapshot
} from "@/server/recommendation/user-profile";
import type { Candidate } from "@/server/recommendation/types";

const NOW = new Date("2026-06-14T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

function signal(partial: Partial<ProfileSignal> & Pick<ProfileSignal, "action" | "weight">): ProfileSignal {
  return {
    createdAt: NOW,
    itemId: undefined,
    tags: [],
    ...partial
  };
}

function candidate(partial: Partial<Candidate> & Pick<Candidate, "id">): Candidate {
  return {
    name: `候选 ${partial.id}`,
    type: "venue",
    city: "上海",
    area: "静安",
    tags: ["展览"],
    trendScore: 60,
    confidence: 80,
    freshnessScore: 70,
    popularity: 50,
    quietness: 50,
    priceLevel: 2,
    source: "amap-poi",
    sourceSignals: [],
    ...partial
  };
}

test("decay uses 4 tiers for positive/neutral signals", () => {
  assert.equal(decay(new Date(NOW.getTime() - 0.5 * DAY), NOW), 1);
  assert.equal(decay(new Date(NOW.getTime() - 3 * DAY), NOW), 0.72);
  assert.equal(decay(new Date(NOW.getTime() - 15 * DAY), NOW), 0.42);
  assert.equal(decay(new Date(NOW.getTime() - 60 * DAY), NOW), 0.18);
});

test("decayNegativeVenue decays faster than positive for venue dimension", () => {
  const at15d = new Date(NOW.getTime() - 15 * DAY);

  assert.equal(decayNegativeVenue(at15d, NOW), 0.18);
  assert.ok(decayNegativeVenue(at15d, NOW) < decay(at15d, NOW));
  // 远期负反馈 venue 几乎失效。
  assert.equal(decayNegativeVenue(new Date(NOW.getTime() - 60 * DAY), NOW), 0.05);
});

test("computeProfileWeights skips when below min sample threshold", () => {
  const result = computeProfileWeights(
    [signal({ action: "up", weight: 1, tags: ["展览"] }), signal({ action: "up", weight: 1, tags: ["咖啡"] })],
    { now: NOW, minSignals: 3 }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.signalCount, 2);
  assert.equal(result.positiveWeights.tag["展览"], undefined);
});

test("computeProfileWeights aggregates tag dimension from positive feedback", () => {
  const result = computeProfileWeights(
    [
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "save", weight: 1.5, tags: ["展览", "书店"] })
    ],
    { now: NOW }
  );

  assert.equal(result.skipped, false);
  // up×2 (decay 1) + save×1.5 (decay 1) = 3.5
  assert.equal(result.positiveWeights.tag["展览"], 3.5);
  assert.equal(result.positiveWeights.tag["书店"], 1.5);
});

test("computeProfileWeights separates positive and negative buckets", () => {
  const result = computeProfileWeights(
    [
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "down", weight: -1.5, tags: ["展览"] })
    ],
    { now: NOW }
  );

  assert.equal(result.positiveWeights.tag["展览"], 2);
  assert.equal(result.negativeWeights.tag["展览"], -1.5);
});

test("down/dismiss action contribute negative weights even below venue min signals still aggregate", () => {
  const result = computeProfileWeights(
    [
      signal({ action: "dismiss", weight: -0.8, tags: ["市集"] }),
      signal({ action: "down", weight: -1.5, source: "xiaohongshu", tags: ["市集"] }),
      signal({ action: "dismiss", weight: -0.8, tags: ["市集"] })
    ],
    { now: NOW }
  );

  assert.equal(result.skipped, false);
  assert.ok((result.negativeWeights.tag["市集"] ?? 0) < 0);
  assert.ok((result.negativeWeights.source["xiaohongshu"] ?? 0) < 0);
});

test("computeProfileWeights aggregates area/price/quietness/popularity dimensions", () => {
  const result = computeProfileWeights(
    [
      signal({ action: "up", weight: 1, area: "静安", priceLevel: 2, quietness: 20, popularity: 70 }),
      signal({ action: "up", weight: 1, area: "静安", priceLevel: 2, quietness: 20, popularity: 70 }),
      signal({ action: "save", weight: 1.5, area: "静安", priceLevel: 2, quietness: 20, popularity: 70 })
    ],
    { now: NOW }
  );

  assert.equal(result.positiveWeights.area["静安"], 3.5);
  assert.equal(result.positiveWeights.priceLevel["2"], 3.5);
  // quietness 20 → "quiet" 桶
  assert.equal(result.positiveWeights.quietnessBand["quiet"], 3.5);
  // popularity 70 → "high" 桶
  assert.equal(result.positiveWeights.popularityBand["high"], 3.5);
});

test("computeProfileWeights applies per-dimension weight cap", () => {
  // 8 条 up 同一 tag = 8,未超 cap(12)。
  const within = computeProfileWeights(
    Array.from({ length: 8 }, () => signal({ action: "up", weight: 1, tags: ["展览"] })),
    { now: NOW }
  );
  assert.equal(within.positiveWeights.tag["展览"], 8);

  // 20 条 up 同一 tag = 20,超 cap(12)被截断。
  const over = computeProfileWeights(
    Array.from({ length: 20 }, () => signal({ action: "up", weight: 1, tags: ["展览"] })),
    { now: NOW }
  );
  assert.equal(over.positiveWeights.tag["展览"], PROFILE_WEIGHT_CAP);
});

test("computeProfileWeights tolerates legacy signals missing extended context fields", () => {
  const result = computeProfileWeights(
    [
      signal({ action: "up", weight: 1, tags: ["咖啡"] }),
      signal({ action: "up", weight: 1, tags: ["咖啡"] }),
      // 历史信号:只有 tags,无 area/price/quietness/popularity。
      signal({ action: "up", weight: 1, tags: ["咖啡"] })
    ],
    { now: NOW }
  );

  assert.equal(result.skipped, false);
  assert.equal(result.positiveWeights.tag["咖啡"], 3);
  assert.equal(result.positiveWeights.area["静安"], undefined);
});

test("computeRecentExposure counts venue exposure within lookback window", () => {
  const exposure = computeRecentExposure(
    [
      { venueIds: ["v1", "v2"], createdAt: new Date(NOW.getTime() - 1 * DAY) },
      { venueIds: ["v1"], createdAt: new Date(NOW.getTime() - 2 * DAY) },
      { venueIds: ["v3"], createdAt: new Date(NOW.getTime() - 5 * DAY) },
      // 超出 30 天窗口。
      { venueIds: ["v4"], createdAt: new Date(NOW.getTime() - 40 * DAY) }
    ],
    { now: NOW, lookbackDays: 30 }
  );

  const byId = new Map(exposure.map((entry) => [entry.venueId, entry]));

  assert.equal(byId.get("v1")?.count, 2);
  assert.equal(byId.get("v2")?.count, 1);
  assert.equal(byId.get("v3")?.count, 1);
  assert.equal(byId.get("v4"), undefined);
});

test("computeRecentExposure caps to recent N entries", () => {
  const logs = Array.from({ length: 50 }, (_, index) => ({
    venueIds: [`v${index}`],
    createdAt: new Date(NOW.getTime() - index * HOUR)
  }));

  const exposure = computeRecentExposure(logs, { now: NOW, limit: 30 });

  assert.equal(exposure.length, 30);
  // 最近的最靠前。
  assert.equal(exposure[0].venueId, "v0");
});

test("candidateDimensionKeys maps candidate attributes to dimension keys", () => {
  const keys = candidateDimensionKeys(
    candidate({
      id: "v1",
      tags: ["展览", "书店"],
      source: "amap-poi",
      area: "静安",
      priceLevel: 2,
      quietness: 20,
      popularity: 80
    })
  );

  const dimensions = keys.map((k) => `${k.dimension}:${k.key}`).sort();

  assert.ok(dimensions.includes("venue:v1"));
  assert.ok(dimensions.includes("tag:展览"));
  assert.ok(dimensions.includes("source:amap-poi"));
  assert.ok(dimensions.includes("area:静安"));
  assert.ok(dimensions.includes("priceLevel:2"));
  assert.ok(dimensions.includes("quietnessBand:quiet"));
  assert.ok(dimensions.includes("popularityBand:high"));
});

test("candidateDimensionKeys omits missing fields without throwing", () => {
  const keys = candidateDimensionKeys(candidate({ id: "v2", tags: [], area: undefined, source: undefined }));

  assert.deepEqual(
    keys.map((k) => k.dimension).sort(),
    ["priceLevel", "quietnessBand", "popularityBand", "venue"].sort()
  );
});

function sampleSnapshot(overrides: Partial<UserProfileSnapshot> = {}): UserProfileSnapshot {
  return {
    profileVersion: PROFILE_VERSION,
    updatedAt: NOW.toISOString(),
    updatedFrom: 5,
    decayWindowDays: 90,
    positiveWeights: {
      venue: {},
      tag: { 展览: 4, 书店: 2 },
      source: { "amap-poi": 1 },
      area: { 静安: 3 },
      priceLevel: {},
      quietnessBand: {},
      popularityBand: {}
    },
    negativeWeights: {
      venue: {},
      tag: { 市集: -2 },
      source: { xiaohongshu: -1 },
      area: {},
      priceLevel: {},
      quietnessBand: {},
      popularityBand: {}
    },
    recentExposure: [{ venueId: "v1", count: 2, lastAt: NOW.toISOString() }],
    topReasons: [],
    ...overrides
  };
}

test("extractProfileFactors returns positive and negative hits and exposure penalty", () => {
  const snap = sampleSnapshot();
  const factors = extractProfileFactors(candidate({ id: "v1", tags: ["展览", "市集"], source: "amap-poi", area: "静安" }), snap);

  const byKey = new Map(factors.map((f) => [`${f.dimension}:${f.key}`, f.weight]));

  // tag 展览 命中正 +4
  assert.equal(byKey.get("tag:展览"), 4);
  // tag 市集 命中负 -2
  assert.equal(byKey.get("tag:市集"), -2);
  // source amap-poi 命中正 +1
  assert.equal(byKey.get("source:amap-poi"), 1);
  // area 静安 命中正 +3
  assert.equal(byKey.get("area:静安"), 3);
  // venue v1 命中曝光惩罚 -2
  assert.equal(byKey.get("venue:v1"), -2);
});

test("extractProfileFactors returns empty array when snapshot is null", () => {
  assert.deepEqual(extractProfileFactors(candidate({ id: "v1", tags: ["展览"] }), null), []);
});

test("extractProfileFactors returns empty array when no dimension matches", () => {
  const factors = extractProfileFactors(
    candidate({ id: "v-unrelated", tags: ["未知标签"], source: undefined, area: undefined, priceLevel: undefined, quietness: undefined, popularity: undefined }),
    sampleSnapshot()
  );

  assert.deepEqual(factors, []);
});

test("topPositiveFactors returns top by absolute weight filtered to positive", () => {
  const factors = topPositiveFactors(sampleSnapshot(), 5);

  assert.ok(factors.every((f) => f.weight > 0));
  // 展览(4) 应排在 书店(2) 之前。
  assert.equal(factors[0].key, "展览");
});

test("topNegativeFactors returns top by absolute weight filtered to negative", () => {
  const factors = topNegativeFactors(sampleSnapshot(), 3);

  assert.ok(factors.every((f) => f.weight < 0));
  assert.equal(factors[0].key, "市集");
});

test("computeTopReasons formats factors as readable strings", () => {
  const reasons = computeTopReasons(sampleSnapshot(), 8);

  assert.ok(reasons.some((r) => r === "tag:展览 +4"));
  assert.ok(reasons.some((r) => r === "tag:市集 -2"));
});

test("buildSnapshot returns null when weights skipped", () => {
  const weights = computeProfileWeights([signal({ action: "up", weight: 1, tags: ["展览"] })], {
    now: NOW,
    minSignals: 3
  });
  const snapshot = buildSnapshot(weights, [], NOW);

  assert.equal(snapshot, null);
});

test("buildSnapshot assembles snapshot with topReasons when enough signals", () => {
  const weights = computeProfileWeights(
    [
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "up", weight: 1, tags: ["展览"] }),
      signal({ action: "save", weight: 1.5, tags: ["展览"] })
    ],
    { now: NOW }
  );
  const snapshot = buildSnapshot(weights, [], NOW);

  assert.ok(snapshot);
  assert.equal(snapshot?.profileVersion, PROFILE_VERSION);
  assert.equal(snapshot?.updatedFrom, 3);
  assert.ok(snapshot?.topReasons.length > 0);
});

test("countExposureHits counts how many candidate ids appear in recent exposure", () => {
  const snap = sampleSnapshot();

  assert.equal(countExposureHits(["v1", "v2", "v3"], snap), 1);
  assert.equal(countExposureHits(["v-other"], snap), 0);
  assert.equal(countExposureHits(["v1"], null), 0);
});

test("parseProfileSnapshot returns null for invalid payload", () => {
  assert.equal(parseProfileSnapshot(null), null);
  assert.equal(parseProfileSnapshot(undefined), null);
  assert.equal(parseProfileSnapshot("string"), null);
  assert.equal(parseProfileSnapshot({}), null);
  assert.equal(parseProfileSnapshot({ profileVersion: "x" }), null);
});

test("parseProfileSnapshot accepts well-formed snapshot", () => {
  const snap = parseProfileSnapshot(sampleSnapshot());

  assert.ok(snap);
  assert.equal(snap?.profileVersion, PROFILE_VERSION);
});

test("isSnapshotStale returns true for null or version mismatch", () => {
  assert.equal(isSnapshotStale(null), true);
  assert.equal(isSnapshotStale(sampleSnapshot({ profileVersion: "old" })), true);
});

test("isSnapshotStale returns true when TTL exceeded", () => {
  // TTL = 30 分钟;updatedAt 在 NOW 之前 60 分钟 → 相对 NOW 已过期。
  const stale = sampleSnapshot({ updatedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString() });

  assert.equal(isSnapshotStale(stale, null, NOW), true);
});

test("isSnapshotStale returns false for fresh snapshot without newer interaction", () => {
  assert.equal(isSnapshotStale(sampleSnapshot(), null, NOW), false);
});

test("isSnapshotStale returns true when interaction newer than snapshot", () => {
  const newerInteraction = new Date(NOW.getTime() + HOUR);

  assert.equal(isSnapshotStale(sampleSnapshot(), newerInteraction, NOW), true);
});

test("buildProfileMeta summarizes snapshot for response meta", () => {
  const meta = buildProfileMeta(sampleSnapshot(), "profile", ["v1", "v2"]);

  assert.equal(meta.source, "profile");
  assert.equal(meta.updatedFrom, 5);
  assert.equal(meta.recentExposureHits, 1);
  assert.ok(meta.topPositive.length > 0);
  assert.ok(meta.topNegative.length > 0);
});

test("buildProfileMeta returns empty shape when snapshot null", () => {
  const meta = buildProfileMeta(null, "empty");

  assert.equal(meta.source, "empty");
  assert.equal(meta.updatedFrom, 0);
  assert.equal(meta.recentExposureHits, 0);
  assert.deepEqual(meta.topPositive, []);
  assert.deepEqual(meta.topNegative, []);
});
