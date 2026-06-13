import type {
  Candidate,
  RecommendInput,
  ScoreBreakdown,
  ScoredCandidate
} from "@/server/recommendation/types";
import { distanceMeters } from "@/server/maps/traffic";

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(scores: number[]) {
  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function tasteScore(candidate: Candidate, input: RecommendInput) {
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

function distanceScore(candidate: Candidate, input: RecommendInput) {
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

function timeFitScore(candidate: Candidate, input: RecommendInput) {
  if (input.timeWindow === "now") {
    return candidate.tags.includes("夜生活") ? 72 : 86;
  }

  if (input.timeWindow === "tonight") {
    return candidate.tags.includes("夜生活") || candidate.type === "event" ? 90 : 74;
  }

  return candidate.type === "event" ? 88 : 76;
}

function budgetScore(candidate: Candidate, input: RecommendInput) {
  if (input.budget === "high") {
    return 84;
  }

  if (input.budget === "medium") {
    return candidate.priceLevel <= 2 ? 88 : 66;
  }

  return candidate.priceLevel <= 1 ? 94 : candidate.priceLevel === 2 ? 78 : 46;
}

export function calculateFinalScore(breakdown: ScoreBreakdown) {
  return clamp(
    breakdown.taste * 0.25 +
      breakdown.socialTrend * 0.18 +
      breakdown.freshness * 0.12 +
      breakdown.distance * 0.12 +
      breakdown.traffic * 0.15 +
      breakdown.timeFit * 0.1 +
      breakdown.novelty * 0.08
  );
}

export function scoreCandidate(candidate: Candidate, input: RecommendInput): ScoredCandidate {
  const sourceSignalScore = input.useSocialSignals === false ? 50 : candidate.trendScore;
  const novelty = clamp(100 - candidate.popularity * 0.5 + candidate.confidence * 0.35);
  const breakdown: ScoreBreakdown = {
    taste: clamp((tasteScore(candidate, input) + budgetScore(candidate, input)) / 2),
    socialTrend: clamp(sourceSignalScore),
    freshness: clamp(candidate.freshnessScore),
    distance: distanceScore(candidate, input),
    traffic: 60,
    timeFit: timeFitScore(candidate, input),
    novelty
  };

  return {
    ...candidate,
    baseScore: calculateFinalScore(breakdown),
    scoreBreakdown: breakdown
  };
}

export function averageBreakdown(items: ScoreBreakdown[]): ScoreBreakdown {
  return {
    taste: clamp(average(items.map((item) => item.taste))),
    socialTrend: clamp(average(items.map((item) => item.socialTrend))),
    freshness: clamp(average(items.map((item) => item.freshness))),
    distance: clamp(average(items.map((item) => item.distance))),
    traffic: clamp(average(items.map((item) => item.traffic))),
    timeFit: clamp(average(items.map((item) => item.timeFit))),
    novelty: clamp(average(items.map((item) => item.novelty)))
  };
}
