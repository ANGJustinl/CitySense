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

export type RankerResult = {
  ranked: ScoredCandidate[];
  ranker: string;
  rankerVersion: string;
};

export interface CandidateRanker {
  name: string;
  version: string;
  rank(input: {
    request: RecommendInput;
    candidates: Candidate[];
  }): Promise<ScoredCandidate[]>;
}

export const weightedRanker: CandidateRanker = {
  name: WEIGHTED_RANKER_NAME,
  version: WEIGHTED_RANKER_VERSION,
  async rank({ request, candidates }) {
    const signals = await loadUserRecommendationSignals(request.userId);

    return candidates
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
  }
};

export async function rankCandidates(
  request: RecommendInput,
  candidates: Candidate[],
  ranker: CandidateRanker = weightedRanker
): Promise<RankerResult> {
  return {
    ranked: await ranker.rank({ request, candidates }),
    ranker: ranker.name,
    rankerVersion: ranker.version
  };
}
