import type {
  Candidate,
  RecommendInput,
  ScoredCandidate
} from "@/server/recommendation/types";
import {
  calculateFinalScore,
  WEIGHTED_RANKER_NAME,
  WEIGHTED_RANKER_VERSION
} from "@/server/recommendation/scoring";
import { buildCandidateFeatures } from "@/server/recommendation/features";
import { loadUserRecommendationSignals } from "@/server/recommendation/user-signals";
import { loadUserProfileForRanking, type UserProfileSnapshot } from "@/server/recommendation/user-profile";

export type RankerResult = {
  ranked: ScoredCandidate[];
  ranker: string;
  rankerVersion: string;
  // TASK2-P0-001：画像命中信息，透出给推荐 meta.profileApplied。
  profileApplied?: {
    version: number;
    topFactors: string[];
    sampleSize: number;
    confidence: "low" | "medium" | "high";
    degraded: boolean;
  };
};

export interface CandidateRanker {
  name: string;
  version: string;
  rank(input: {
    request: RecommendInput;
    candidates: Candidate[];
  }): Promise<ScoredCandidate[]>;
}

/**
 * TASK2-P0-001 约束 4：无画像时保持当前行为。
 * - 有 userId 且画像 sampleSize>=5 → 用画像版 affinity/penalty/exposure。
 * - 否则（匿名 / 画像空 / 读取失败）→ 回退即时 interaction 聚合。
 */
export const weightedRanker: CandidateRanker & {
  rank(input: {
    request: RecommendInput;
    candidates: Candidate[];
  }): Promise<ScoredCandidate[]>;
  profile?: UserProfileSnapshot;
} = {
  name: WEIGHTED_RANKER_NAME,
  version: WEIGHTED_RANKER_VERSION,
  profile: undefined,
  async rank({ request, candidates }) {
    const { profile, degraded } = await loadUserProfileForRanking(request.userId);
    // 画像不可用时回退即时 interaction 聚合（保持改造前行为）。
    const signals = degraded ? await loadUserRecommendationSignals(request.userId) : undefined;
    this.profile = degraded ? undefined : profile;

    return candidates
      .map((candidate) => {
        const features = buildCandidateFeatures(candidate, request, {
          profile: degraded ? undefined : profile,
          signals
        });
        const scoreBreakdown = {
          taste: features.taste,
          textRelevance: features.textRelevance,
          socialTrend: features.socialTrend,
          freshness: features.freshness,
          distance: features.distance,
          traffic: features.traffic,
          timeFit: features.timeFit,
          novelty: features.novelty,
          actionability: features.actionability,
          userAffinity: features.userAffinity,
          feedbackPenalty: features.feedbackPenalty,
          exposurePenalty: features.exposurePenalty
        };

        return {
          ...candidate,
          features,
          scoreBreakdown,
          baseScore: calculateFinalScore(scoreBreakdown),
          ranker: WEIGHTED_RANKER_NAME,
          rankerVersion: WEIGHTED_RANKER_VERSION
        };
      })
      .sort((a, b) => b.baseScore - a.baseScore);
  }
};

export async function rankCandidates(
  request: RecommendInput,
  candidates: Candidate[],
  ranker: CandidateRanker & { profile?: UserProfileSnapshot } = weightedRanker
): Promise<RankerResult> {
  const ranked = await ranker.rank({ request, candidates });
  const profile = ranker.profile;

  return {
    ranked,
    ranker: ranker.name,
    rankerVersion: ranker.version,
    profileApplied: profile
      ? {
          version: profile.profileVersion,
          topFactors: profile.topReasons,
          sampleSize: profile.sampleSize,
          confidence: profile.confidence,
          degraded: false
        }
      : {
          version: 1,
          topFactors: [],
          sampleSize: 0,
          confidence: "low",
          degraded: true
        }
  };
}
