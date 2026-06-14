import type {
  Candidate,
  CandidateFeatures,
  ProfileFactor,
  RecommendInput
} from "@/server/recommendation/types";
import { createDefaultFeatures } from "@/server/recommendation/scoring";
import {
  calculateUserAffinity,
  calculateFeedbackPenalty,
  type UserRecommendationSignals
} from "@/server/recommendation/user-signals";
import {
  calculateExposurePenalty,
  calculateFeedbackPenaltyFromProfile,
  calculateUserAffinityFromProfile,
  PROFILE_VERSION,
  type UserProfileSnapshot
} from "@/server/recommendation/user-profile-v2";

export type FeatureBuildSources = {
  signals?: UserRecommendationSignals;
  profile?: UserProfileSnapshot;
};

/**
 * 画像优先、信号回退（TASK2-P0-001 约束 4）：
 * - 有 userId 且画像非空（sampleSize>=5）→ 用画像版 affinity/penalty + exposure。
 * - 否则（匿名 / 画像空 / 读取失败）→ 回退到原即时 interaction 聚合，行为等价改造前。
 */
export function buildCandidateFeatures(
  candidate: Candidate,
  request: RecommendInput,
  sources: FeatureBuildSources = {}
): CandidateFeatures {
  const base = createDefaultFeatures(candidate, request);
  const profile = sources.profile && sources.profile.sampleSize >= 5 ? sources.profile : undefined;

  if (profile) {
    const affinity = calculateUserAffinityFromProfile(candidate, profile);
    const penalty = calculateFeedbackPenaltyFromProfile(candidate, profile);
    const exposure = calculateExposurePenalty(candidate, profile);
    const profileFactors: ProfileFactor[] = [
      ...affinity.factors,
      ...penalty.factors
    ];
    if (exposure.reason) {
      profileFactors.push({ dimension: "tag", key: exposure.reason, delta: -exposure.penalty });
    }

    return {
      ...base,
      userAffinity: affinity.score,
      feedbackPenalty: penalty.score,
      exposurePenalty: exposure.penalty,
      profileFactors: profileFactors.length > 0 ? profileFactors : undefined,
      profileHit: affinity.profileHit || penalty.profileHit || exposure.penalty > 0,
      profileVersion: PROFILE_VERSION
    };
  }

  // 回退路径：保持改造前行为（即时 interaction 聚合）。
  // TASK2-P0-004：匿名用户冷启动多样性补偿——当请求携带 recentExposure
  //（前端记录的上次推荐 place/title）时，对命中候选施加轻量 exposurePenalty，
  // 避免无画像用户反复看到相同 Top 路线。有画像用户走上面的 profile.exposure 通道。
  const signals = sources.signals;
  const anonymousExposure = calculateAnonymousExposurePenalty(candidate, request);
  return {
    ...base,
    userAffinity: signals
      ? calculateUserAffinity(candidate, signals)
      : base.userAffinity,
    feedbackPenalty: signals
      ? calculateFeedbackPenalty(candidate, signals)
      : base.feedbackPenalty,
    exposurePenalty: anonymousExposure.penalty
  };
}

/**
 * 匿名用户 exposure 惩罚（TASK2-P0-004）。
 * 复用画像 exposure 的判定逻辑（itemId 命中 8 分、routeTitle 命中 4 分），
 * 但从 request.recentExposure 读取，不依赖 UserProfileSnapshot。
 * 无 recentExposure 时返回 0，完全等价改造前行为。
 */
function calculateAnonymousExposurePenalty(
  candidate: Candidate,
  request: RecommendInput
): { penalty: number; reason?: string } {
  const exposure = request.recentExposure;
  if (!exposure) {
    return { penalty: 0 };
  }
  const itemIds = exposure.itemIds ?? [];
  const routeTitles = exposure.routeTitles ?? [];
  if (itemIds.length === 0 && routeTitles.length === 0) {
    return { penalty: 0 };
  }
  if (itemIds.includes(candidate.id)) {
    return { penalty: 8, reason: `recentlySeen:itemId ${candidate.id}` };
  }
  if (candidate.name && routeTitles.some((title) => title.includes(candidate.name))) {
    return { penalty: 4, reason: `recentlySeen:theme ${candidate.name}` };
  }
  return { penalty: 0 };
}

export function buildCandidateFeatureSet(
  candidates: Candidate[],
  request: RecommendInput,
  sources: FeatureBuildSources = {}
) {
  return candidates.map((candidate) => buildCandidateFeatures(candidate, request, sources));
}
