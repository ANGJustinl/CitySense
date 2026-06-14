import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidateFeatures } from "@/server/recommendation/features";
import type {
  Candidate,
  RecommendInput
} from "@/server/recommendation/types";

const baseRequest: RecommendInput = {
  city: "上海",
  interests: ["咖啡", "展览"],
  mood: "solo",
  budget: "medium",
  timeWindow: "tonight",
  useRealtimeTraffic: false,
  useSocialSignals: true
};

function candidate(id: string): Candidate {
  return {
    id,
    name: `候选 ${id}`,
    type: "venue",
    city: "上海",
    area: "静安",
    address: `${id} 路`,
    lat: 31.22,
    lng: 121.45,
    tags: ["咖啡"],
    trendScore: 70,
    confidence: 80,
    freshnessScore: 78,
    popularity: 62,
    quietness: 50,
    priceLevel: 2,
    source: "amap-poi",
    sourceSignals: [],
    recallChannels: ["base"],
    textRelevance: 70
  };
}

test("匿名用户无 recentExposure → exposurePenalty = 0（等价改造前行为）", () => {
  const features = buildCandidateFeatures(candidate("v1"), baseRequest);
  assert.equal(features.exposurePenalty, 0);
  assert.equal(features.userAffinity, 50);
});

test("匿名用户 + recentExposure.itemIds 命中 → exposurePenalty = 8", () => {
  const request: RecommendInput = {
    ...baseRequest,
    recentExposure: { itemIds: ["v1", "v2"], routeTitles: [] }
  };
  const features = buildCandidateFeatures(candidate("v1"), request);
  assert.equal(features.exposurePenalty, 8);
  // userAffinity 仍为中性（匿名无画像）
  assert.equal(features.userAffinity, 50);
});

test("匿名用户 + recentExposure.routeTitles 命中 → exposurePenalty = 4", () => {
  const request: RecommendInput = {
    ...baseRequest,
    recentExposure: { itemIds: [], routeTitles: ["候选 v1 即刻路线"] }
  };
  const features = buildCandidateFeatures(candidate("v1"), request);
  assert.equal(features.exposurePenalty, 4);
});

test("匿名用户 + recentExposure 未命中 → exposurePenalty = 0", () => {
  const request: RecommendInput = {
    ...baseRequest,
    recentExposure: { itemIds: ["other-id"], routeTitles: ["不相关标题"] }
  };
  const features = buildCandidateFeatures(candidate("v1"), request);
  assert.equal(features.exposurePenalty, 0);
});

test("匿名用户 recentExposure 为空数组 → exposurePenalty = 0", () => {
  const request: RecommendInput = {
    ...baseRequest,
    recentExposure: { itemIds: [], routeTitles: [] }
  };
  const features = buildCandidateFeatures(candidate("v1"), request);
  assert.equal(features.exposurePenalty, 0);
});

test("冷启动多样性：命中曝光的候选分数低于未命中候选", () => {
  // 两个完全相同的候选，一个在 recentExposure 中，一个不在。
  // 命中的应因 exposurePenalty 而排序靠后。
  const request: RecommendInput = {
    ...baseRequest,
    recentExposure: { itemIds: ["seen"], routeTitles: [] }
  };

  const seenFeatures = buildCandidateFeatures(candidate("seen"), request);
  const freshFeatures = buildCandidateFeatures(candidate("fresh"), request);

  assert.ok(
    freshFeatures.exposurePenalty < seenFeatures.exposurePenalty,
    "未命中候选的 exposurePenalty 应更低"
  );
});
