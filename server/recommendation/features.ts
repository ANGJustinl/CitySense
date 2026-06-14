import type {
  Candidate,
  CandidateFeatures,
  ProfileFactor,
  RecommendInput
} from "@/server/recommendation/types";
import { createDefaultFeatures } from "@/server/recommendation/scoring";
import {
  calculateFeedbackPenalty,
  calculateUserAffinity,
  type UserRecommendationSignals
} from "@/server/recommendation/user-signals";
import {
  calculateExposurePenalty,
  calculateFeedbackPenaltyFromProfile,
  calculateUserAffinityFromProfile,
  PROFILE_VERSION,
  type UserProfileSnapshot
} from "@/server/recommendation/user-profile";

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

  // 回退路径：保持改造前行为（即时 interaction 聚合，无 exposure）。
  const signals = sources.signals;
  return {
    ...base,
    userAffinity: signals
      ? calculateUserAffinity(candidate, signals)
      : base.userAffinity,
    feedbackPenalty: signals
      ? calculateFeedbackPenalty(candidate, signals)
      : base.feedbackPenalty,
    exposurePenalty: 0
  };
}

export function buildCandidateFeatureSet(
  candidates: Candidate[],
  request: RecommendInput,
  sources: FeatureBuildSources = {}
) {
  return candidates.map((candidate) => buildCandidateFeatures(candidate, request, sources));
}
