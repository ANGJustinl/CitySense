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
import { extractProfileFactors } from "@/server/recommendation/user-profile-core";

export function buildCandidateFeatures(
  candidate: Candidate,
  request: RecommendInput,
  signals: UserRecommendationSignals
): CandidateFeatures {
  const profileFactors = extractProfileFactors(candidate, signals.snapshot);

  return {
    ...createDefaultFeatures(candidate, request),
    userAffinity: calculateUserAffinity(candidate, signals),
    feedbackPenalty: calculateFeedbackPenalty(candidate, signals),
    profileFactors
  };
}

export function buildCandidateFeatureSet(
  candidates: Candidate[],
  request: RecommendInput,
  signals: UserRecommendationSignals
) {
  return candidates.map((candidate) => buildCandidateFeatures(candidate, request, signals));
}
