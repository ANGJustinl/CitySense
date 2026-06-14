import type {
  Candidate,
  CandidateFeatures,
  RecommendInput,
  ScoreBreakdown,
  ScoredCandidate
} from "@/server/recommendation/types";
import { distanceMeters } from "@/server/maps/traffic";
import { assessCandidateQuality } from "@/server/recommendation/quality";

export const WEIGHTED_RANKER_NAME = "weighted-v1";
export const WEIGHTED_RANKER_VERSION = "weighted-v1.2-profile";

// 权重调整历史：
// - TASK2-P0-001（2026-06-14）：引入画像层，userAffinity 0.05→0.35，新增 exposurePenalty。
// - TASK2-P0-004（2026-06-15）：权重归一化。原正权重之和=1.34（远超 1.0），导致高分候选
//   饱和在 100、分数区分度被压缩、排序信号被淹没。现将正权重之和收敛到 1.00，使
//   calculateFinalScore 成为真正的加权平均（all-100→100, all-50→50, all-0→0）。
//   主要调整：userAffinity 0.35→0.18（仍是最强正向维度之一，但不再垄断排序）；
//   actionability 保持高位作为质量门；taste/distance/traffic 等按比例微调。
//   负权重（feedbackPenalty/exposurePenalty）保持不变，仍为 [0,100] 区间内的减分项。
// 无画像时 affinity=50(中性)、penalty=0、exposure=0，等价于改造前行为。
//
// 正权重求和校验：0.16+0.07+0.08+0.06+0.10+0.09+0.05+0.03+0.18+0.18 = 1.00
export const WEIGHTED_RANKER_WEIGHTS = {
  taste: 0.16,
  textRelevance: 0.07,
  socialTrend: 0.08,
  freshness: 0.06,
  distance: 0.1,
  traffic: 0.09,
  timeFit: 0.05,
  novelty: 0.03,
  actionability: 0.18,
  userAffinity: 0.18,
  feedbackPenalty: -0.1,
  exposurePenalty: -0.05
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

function isGenericSocialListicle(candidate: Candidate) {
  const text = [candidate.name, candidate.description, ...candidate.tags].filter(Boolean).join(" ");

  return /合集|汇总|路线|攻略|地图|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|\d+\+?个|\d+家/i.test(text);
}

function candidateQuality(candidate: Candidate) {
  if (
    typeof candidate.qualityScore === "number" &&
    Array.isArray(candidate.qualityFlags) &&
    typeof candidate.routeEligible === "boolean"
  ) {
    return {
      qualityScore: candidate.qualityScore,
      qualityFlags: candidate.qualityFlags,
      routeEligible: candidate.routeEligible
    };
  }

  return assessCandidateQuality({
    name: candidate.name,
    type: candidate.type,
    source: candidate.source,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    tags: candidate.tags
  });
}

export function calculateActionabilityScore(candidate: Candidate) {
  const hasAddress = Boolean(candidate.address?.trim());
  const hasCoordinates = Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng);
  const quality = candidateQuality(candidate);

  if (quality.qualityFlags.includes("generic_social")) {
    return Math.min(12, quality.qualityScore);
  }

  if (hasAddress && hasCoordinates) {
    return clamp(100 * 0.6 + quality.qualityScore * 0.4);
  }

  if (hasCoordinates) {
    return clamp(92 * 0.6 + quality.qualityScore * 0.4);
  }

  if (hasAddress) {
    return clamp(82 * 0.6 + quality.qualityScore * 0.4);
  }

  if (isGenericSocialListicle(candidate)) {
    return 12;
  }

  if (/咖啡馆|咖啡店|书店|画廊|美术馆|公园|中心|市集|展|节|店/.test(candidate.name)) {
    return 42;
  }

  return 28;
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
      breakdown.actionability * WEIGHTED_RANKER_WEIGHTS.actionability +
      breakdown.userAffinity * WEIGHTED_RANKER_WEIGHTS.userAffinity +
      breakdown.feedbackPenalty * WEIGHTED_RANKER_WEIGHTS.feedbackPenalty +
      breakdown.exposurePenalty * WEIGHTED_RANKER_WEIGHTS.exposurePenalty
  );
}

export function createDefaultFeatures(candidate: Candidate, input: RecommendInput): CandidateFeatures {
  const quality = candidateQuality(candidate);
  const signalStrength = candidate.signalStrength ?? candidate.trendScore;
  const sourceSignalScore = input.useSocialSignals === false ? 50 : signalStrength;
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
    actionability: calculateActionabilityScore(candidate),
    userAffinity: 50,
    feedbackPenalty: 0,
    exposurePenalty: 0,
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags,
    signalStrength: clamp(signalStrength),
    routeEligible: quality.routeEligible
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
    actionability: clamp(average(items.map((item) => item.actionability))),
    userAffinity: clamp(average(items.map((item) => item.userAffinity))),
    feedbackPenalty: clamp(average(items.map((item) => item.feedbackPenalty))),
    exposurePenalty: clamp(average(items.map((item) => item.exposurePenalty)))
  };
}
