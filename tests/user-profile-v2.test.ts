import assert from "node:assert/strict";
import test from "node:test";
import {
  AFFINITY_NEUTRAL,
  calculateExposurePenalty,
  calculateFeedbackPenaltyFromProfile,
  calculateUserAffinityFromProfile,
  EMPTY_USER_PROFILE,
  NEGATIVE_PREFERENCE_HARD_CAP,
  POSITIVE_PREFERENCE_HARD_CAP,
  PROFILE_VERSION,
  type UserProfileSnapshot
} from "@/server/recommendation/user-profile-v2";
import type { Candidate } from "@/server/recommendation/types";

function candidate(id: string, tags: string[], source?: string): Candidate {
  return {
    id,
    name: `候选 ${id}`,
    type: "venue",
    city: "上海",
    area: "静安",
    address: `${id} 路`,
    lat: 31.2,
    lng: 121.4,
    tags,
    trendScore: 70,
    confidence: 80,
    freshnessScore: 78,
    popularity: 60,
    quietness: 50,
    priceLevel: 2,
    source,
    sourceSignals: [],
    recallChannels: ["base"]
  };
}

function buildProfile(overrides: Partial<UserProfileSnapshot> = {}): UserProfileSnapshot {
  return {
    ...EMPTY_USER_PROFILE,
    profileVersion: PROFILE_VERSION,
    updatedFrom: "feedback",
    generatedAt: new Date().toISOString(),
    sampleSize: 20,
    confidence: "medium",
    ...overrides
  };
}

test("calculateUserAffinityFromProfile: 空画像或低样本返回中性 50，不命中", () => {
  const c = candidate("v1", ["展览"]);
  // sampleSize < 5
  const lowSample = buildProfile({ sampleSize: 3 });
  const result = calculateUserAffinityFromProfile(c, lowSample);
  assert.equal(result.score, AFFINITY_NEUTRAL);
  assert.equal(result.profileHit, false);
  assert.equal(result.factors.length, 0);

  // 空画像
  const emptyResult = calculateUserAffinityFromProfile(c, EMPTY_USER_PROFILE);
  assert.equal(emptyResult.score, AFFINITY_NEUTRAL);
  assert.equal(emptyResult.profileHit, false);
});

test("calculateUserAffinityFromProfile: 命中正偏好 tag/source 时上探并给出 attribution", () => {
  const c = candidate("v1", ["展览", "咖啡"], "damai");
  const profile = buildProfile({
    positiveWeights: [
      { dimension: "tag", key: "展览", weight: POSITIVE_PREFERENCE_HARD_CAP, sampleSize: 5 },
      { dimension: "source", key: "damai", weight: POSITIVE_PREFERENCE_HARD_CAP / 2, sampleSize: 3 }
    ]
  });
  const result = calculateUserAffinityFromProfile(c, profile);
  assert.ok(result.score > AFFINITY_NEUTRAL, `score should exceed neutral, got ${result.score}`);
  assert.equal(result.profileHit, true);
  // attribution 应包含 tag:展览（约束：可追溯 tag:展览 +N）
  const tagFactor = result.factors.find((f) => f.dimension === "tag" && f.key === "展览");
  assert.ok(tagFactor, "should include tag:展览 factor");
  assert.ok(tagFactor!.delta > 0, "tag delta should be positive");
});

test("calculateFeedbackPenaltyFromProfile: 无负偏好返回 0", () => {
  const c = candidate("v1", ["展览"]);
  const profile = buildProfile({ negativeWeights: [] });
  const result = calculateFeedbackPenaltyFromProfile(c, profile);
  assert.equal(result.score, 0);
  assert.equal(result.profileHit, false);
});

test("calculateFeedbackPenaltyFromProfile: 命中负偏好 tag 时惩罚在硬上限内且 attribution 为负", () => {
  const c = candidate("v1", ["夜生活"], "xiaohongshu");
  const profile = buildProfile({
    negativeWeights: [
      { dimension: "tag", key: "夜生活", weight: NEGATIVE_PREFERENCE_HARD_CAP, sampleSize: 3 },
      { dimension: "source", key: "xiaohongshu", weight: 10, sampleSize: 2 }
    ]
  });
  const result = calculateFeedbackPenaltyFromProfile(c, profile);
  assert.ok(result.score > 0, "penalty should be positive");
  assert.ok(result.score <= NEGATIVE_PREFERENCE_HARD_CAP, "penalty capped by hard cap");
  assert.equal(result.profileHit, true);
  const tagFactor = result.factors.find((f) => f.dimension === "tag" && f.key === "夜生活");
  assert.ok(tagFactor, "should include tag:夜生活 factor");
  assert.ok(tagFactor!.delta < 0, "negative delta");
});

test("约束 3：单次 down/dismiss（sampleSize<2）不应进入 negativeWeights（在 recompute 阶段过滤），故 penalty 为 0", () => {
  // 此测试模拟 recompute 已应用 applyNegativeSampleFloor 后的状态：
  // 单次负反馈产生的负偏好（sampleSize=1）已被过滤，negativeWeights 不含该项。
  const c = candidate("v1", ["单人"]);
  const profile = buildProfile({
    negativeWeights: [] // 单次负反馈已被 floor 过滤掉
  });
  const result = calculateFeedbackPenaltyFromProfile(c, profile);
  assert.equal(result.score, 0);
});

test("calculateExposurePenalty: 命中最近曝光 itemId 给轻惩罚", () => {
  const c = candidate("recent-venue-1", ["展览"]);
  const profile = buildProfile({
    recentExposure: {
      itemIds: ["recent-venue-1", "other"],
      routeTitles: [],
      windowDays: 14,
      capturedAt: new Date().toISOString()
    }
  });
  const result = calculateExposurePenalty(c, profile);
  assert.equal(result.penalty, 8);
  assert.ok(result.reason?.includes("recentlySeen:itemId"));
});

test("calculateExposurePenalty: 命中 routeTitle 主题给更轻惩罚", () => {
  const c = candidate("v2", ["咖啡"]);
  c.name = "安福路咖啡地图";
  const profile = buildProfile({
    recentExposure: {
      itemIds: [],
      routeTitles: ["周末安福路咖啡地图探店"],
      windowDays: 14,
      capturedAt: new Date().toISOString()
    }
  });
  const result = calculateExposurePenalty(c, profile);
  assert.equal(result.penalty, 4);
});

test("calculateExposurePenalty: 未命中返回 0", () => {
  const c = candidate("fresh-venue", ["展览"]);
  const profile = buildProfile({
    recentExposure: {
      itemIds: ["other-1"],
      routeTitles: ["其他路线"],
      windowDays: 14,
      capturedAt: new Date().toISOString()
    }
  });
  const result = calculateExposurePenalty(c, profile);
  assert.equal(result.penalty, 0);
  assert.equal(result.reason, undefined);
});

test("EMPTY_USER_PROFILE: 所有 affinity 字段为中性，权重为空", () => {
  assert.equal(EMPTY_USER_PROFILE.sampleSize, 0);
  assert.equal(EMPTY_USER_PROFILE.confidence, "low");
  assert.equal(EMPTY_USER_PROFILE.positiveWeights.length, 0);
  assert.equal(EMPTY_USER_PROFILE.negativeWeights.length, 0);
  assert.equal(EMPTY_USER_PROFILE.sourceAffinity, AFFINITY_NEUTRAL);
  assert.equal(EMPTY_USER_PROFILE.recentExposure.itemIds.length, 0);
});

test("约束 4：空画像下 affinity/penalty/exposure 全部中性，等价改造前行为", () => {
  const c = candidate("v1", ["展览"], "damai");
  const affinity = calculateUserAffinityFromProfile(c, EMPTY_USER_PROFILE);
  const penalty = calculateFeedbackPenaltyFromProfile(c, EMPTY_USER_PROFILE);
  const exposure = calculateExposurePenalty(c, EMPTY_USER_PROFILE);
  assert.equal(affinity.score, AFFINITY_NEUTRAL);
  assert.equal(penalty.score, 0);
  assert.equal(exposure.penalty, 0);
});
