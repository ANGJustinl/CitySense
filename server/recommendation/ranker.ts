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
import { loadUserRecommendationSignals, type UserRecommendationSignals } from "@/server/recommendation/user-signals";

/**
 * ranker 内部返回:ranked 候选 + 加载的 signals(供 recommend.ts 构建 meta.userProfile)。
 */
export type RankOutput = {
  ranked: ScoredCandidate[];
  signals?: UserRecommendationSignals;
};

export type RankerResult = {
  ranked: ScoredCandidate[];
  ranker: string;
  rankerVersion: string;
  /** TASK-P2-002:暴露加载的用户信号,用于构建 meta.userProfile。 */
  signals?: UserRecommendationSignals;
};

export interface CandidateRanker {
  name: string;
  version: string;
  rank(input: {
    request: RecommendInput;
    candidates: Candidate[];
  }): Promise<RankOutput>;
}

export const weightedRanker: CandidateRanker = {
  name: WEIGHTED_RANKER_NAME,
  version: WEIGHTED_RANKER_VERSION,
  async rank({ request, candidates }): Promise<RankOutput> {
    // TASK-P2-002:profileKey = userId ?? sessionId,与 feedback 链路对齐。
    const profileKey = request.userId ?? request.sessionId;
    const signals = await loadUserRecommendationSignals(profileKey);

    const ranked = candidates
      .map((candidate) => {
        const features = buildCandidateFeatures(candidate, request, signals);
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
          feedbackPenalty: features.feedbackPenalty
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

    return { ranked, signals };
  }
};

export async function rankCandidates(
  request: RecommendInput,
  candidates: Candidate[],
  ranker: CandidateRanker = weightedRanker
): Promise<RankerResult> {
  const output = await ranker.rank({ request, candidates });

  return {
    ranked: output.ranked,
    ranker: ranker.name,
    rankerVersion: ranker.version,
    signals: output.signals
  };
}
