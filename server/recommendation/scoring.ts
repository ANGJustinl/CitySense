import type {
  Candidate,
  CandidateFeatures,
  RecommendInput,
  ScoreBreakdown,
  ScoredCandidate
} from "@/server/recommendation/types";
import { distanceMeters } from "@/server/maps/traffic";

export const WEIGHTED_RANKER_NAME = "weighted-v1";
export const WEIGHTED_RANKER_VERSION = "2026-06-13";

export const WEIGHTED_RANKER_WEIGHTS = {
  taste: 0.22,
  textRelevance: 0.1,
  socialTrend: 0.14,
  freshness: 0.1,
  distance: 0.1,
  traffic: 0.14,
  timeFit: 0.08,
  novelty: 0.06,
  userAffinity: 0.08,
  feedbackPenalty: -0.12
} satisfies Record<keyof ScoreBreakdown, number>;

export function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(scores: number[]) {
  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function calculateTasteScore(candidate: Candidate, input: RecommendInput) {
  if (input.interests.length === 0) {
    return 62;
  }

  const candidateText = [candidate.name, candidate.description, ...candidate.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matches = input.interests.filter((interest) =>
    candidateText.includes(interest.toLowerCase())
  );
  const directScore = (matches.length / input.interests.length) * 100;

  const moodBoosts: Record<typeof input.mood, number> = {
    quiet: candidate.quietness,
    lively: 100 - candidate.quietness * 0.45 + candidate.popularity * 0.3,
    date: candidate.tags.includes("约会") ? 92 : candidate.quietness * 0.55 + 25,
    solo: candidate.tags.includes("solo") ? 92 : candidate.quietness * 0.75,
    random: candidate.confidence * 0.45 + (100 - candidate.popularity) * 0.35
  };

  return clamp(directScore * 0.7 + moodBoosts[input.mood] * 0.3);
}

export function calculateDistanceScore(candidate: Candidate, input: RecommendInput) {
  if (!input.origin || !candidate.lat || !candidate.lng) {
    return 62;
  }

  const meters = distanceMeters(input.origin, {
    lat: candidate.lat,
    lng: candidate.lng
  });

  if (meters <= 1200) return 96;
  if (meters <= 3000) return 82;
  if (meters <= 6000) return 64;
  if (meters <= 10_000) return 46;
  return 28;
}

export function calculateTimeFitScore(candidate: Candidate, input: RecommendInput) {
  if (input.timeWindow === "now") {
    return candidate.tags.includes("夜生活") ? 72 : 86;
  }

  if (input.timeWindow === "tonight") {
    return candidate.tags.includes("夜生活") || candidate.type === "event" ? 90 : 74;
  }

  return candidate.type === "event" ? 88 : 76;
}

export function calculateBudgetScore(candidate: Candidate, input: RecommendInput) {
  if (input.budget === "high") {
    return 84;
  }

  if (input.budget === "medium") {
    return candidate.priceLevel <= 2 ? 88 : 66;
  }

  return candidate.priceLevel <= 1 ? 94 : candidate.priceLevel === 2 ? 78 : 46;
}

export function calculateTextRelevance(candidate: Candidate, input: RecommendInput) {
  if (candidate.textRelevance !== undefined) {
    return clamp(candidate.textRelevance);
  }

  if (input.interests.length === 0) {
    return 55;
  }

  const searchable = [candidate.name, candidate.description, candidate.address, ...candidate.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matches = input.interests.filter((interest) =>
    searchable.includes(interest.toLowerCase())
  );

  return clamp((matches.length / input.interests.length) * 100);
}

export function calculateFinalScore(breakdown: ScoreBreakdown) {
  return clamp(
    breakdown.taste * WEIGHTED_RANKER_WEIGHTS.taste +
      breakdown.textRelevance * WEIGHTED_RANKER_WEIGHTS.textRelevance +
      breakdown.socialTrend * WEIGHTED_RANKER_WEIGHTS.socialTrend +
      breakdown.freshness * WEIGHTED_RANKER_WEIGHTS.freshness +
      breakdown.distance * WEIGHTED_RANKER_WEIGHTS.distance +
      breakdown.traffic * WEIGHTED_RANKER_WEIGHTS.traffic +
      breakdown.timeFit * WEIGHTED_RANKER_WEIGHTS.timeFit +
      breakdown.novelty * WEIGHTED_RANKER_WEIGHTS.novelty +
      breakdown.userAffinity * WEIGHTED_RANKER_WEIGHTS.userAffinity +
      breakdown.feedbackPenalty * WEIGHTED_RANKER_WEIGHTS.feedbackPenalty
  );
}

export function createDefaultFeatures(candidate: Candidate, input: RecommendInput): CandidateFeatures {
  const sourceSignalScore = input.useSocialSignals === false ? 50 : candidate.trendScore;
  const novelty = clamp(100 - candidate.popularity * 0.5 + candidate.confidence * 0.35);

  return {
    candidateId: candidate.id,
    taste: clamp((calculateTasteScore(candidate, input) + calculateBudgetScore(candidate, input)) / 2),
    textRelevance: calculateTextRelevance(candidate, input),
    socialTrend: clamp(sourceSignalScore),
    freshness: clamp(candidate.freshnessScore),
    distance: calculateDistanceScore(candidate, input),
    traffic: 60,
    timeFit: calculateTimeFitScore(candidate, input),
    novelty,
    userAffinity: 50,
    feedbackPenalty: 0
  };
}

export function scoreCandidate(candidate: Candidate, input: RecommendInput): ScoredCandidate {
  const features = createDefaultFeatures(candidate, input);
  const breakdown: ScoreBreakdown = features;

  return {
    ...candidate,
    baseScore: calculateFinalScore(breakdown),
    scoreBreakdown: breakdown,
    features,
    ranker: WEIGHTED_RANKER_NAME,
    rankerVersion: WEIGHTED_RANKER_VERSION
  };
}

export function averageBreakdown(items: ScoreBreakdown[]): ScoreBreakdown {
  return {
    taste: clamp(average(items.map((item) => item.taste))),
    textRelevance: clamp(average(items.map((item) => item.textRelevance))),
    socialTrend: clamp(average(items.map((item) => item.socialTrend))),
    freshness: clamp(average(items.map((item) => item.freshness))),
    distance: clamp(average(items.map((item) => item.distance))),
    traffic: clamp(average(items.map((item) => item.traffic))),
    timeFit: clamp(average(items.map((item) => item.timeFit))),
    novelty: clamp(average(items.map((item) => item.novelty))),
    userAffinity: clamp(average(items.map((item) => item.userAffinity))),
    feedbackPenalty: clamp(average(items.map((item) => item.feedbackPenalty)))
  };
}
