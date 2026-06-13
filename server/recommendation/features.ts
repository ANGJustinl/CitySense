import type {
  Candidate,
  CandidateFeatures,
  RecommendInput
} from "@/server/recommendation/types";
import { createDefaultFeatures } from "@/server/recommendation/scoring";
import {
  calculateFeedbackPenalty,
  calculateUserAffinity,
  type UserRecommendationSignals
} from "@/server/recommendation/user-signals";

export function buildCandidateFeatures(
  candidate: Candidate,
  request: RecommendInput,
  signals: UserRecommendationSignals
): CandidateFeatures {
  return {
    ...createDefaultFeatures(candidate, request),
    userAffinity: calculateUserAffinity(candidate, signals),
    feedbackPenalty: calculateFeedbackPenalty(candidate, signals)
  };
}

export function buildCandidateFeatureSet(
  candidates: Candidate[],
  request: RecommendInput,
  signals: UserRecommendationSignals
) {
  return candidates.map((candidate) => buildCandidateFeatures(candidate, request, signals));
}
