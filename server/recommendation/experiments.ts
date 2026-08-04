import type {
  CityConditionSummary
} from "@/server/city-state/types";
import type {
  RecommendExperimentMeta,
  RecommendInput,
  TrafficCandidate
} from "@/server/recommendation/types";

export const RECOMMENDATION_EXPERIMENT_NAME = "recommendation-trust-v1";
export const RECOMMENDATION_EXPERIMENT_VARIANTS = ["control", "trust-aware-v1"] as const;

const TRUST_AUTHORITY_SOURCES = new Set(["amap-poi", "damai", "shanghai-gov"]);
const TREND_ONLY_SOURCES = new Set(["xiaohongshu", "trends-hub", "douban", "bilibili"]);

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hashBucket(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0) % 100;
}

function overrideAllowed() {
  return process.env.CITYSENSE_EXPERIMENT_OVERRIDE === "true";
}

function bucketKeyFor(input: RecommendInput) {
  return (
    input.userId ??
    input.sessionId ??
    `anonymous:${input.city}:${input.area ?? ""}:${input.interests.join("|")}`
  );
}

export function assignRecommendationExperiment(input: RecommendInput): RecommendExperimentMeta {
  const bucketKey = bucketKeyFor(input);

  if (
    input.experimentVariant &&
    overrideAllowed() &&
    RECOMMENDATION_EXPERIMENT_VARIANTS.includes(input.experimentVariant)
  ) {
    return {
      name: RECOMMENDATION_EXPERIMENT_NAME,
      variant: input.experimentVariant,
      bucketKey
    };
  }

  return {
    name: RECOMMENDATION_EXPERIMENT_NAME,
    variant: hashBucket(`${RECOMMENDATION_EXPERIMENT_NAME}:${bucketKey}`) < 50
      ? "control"
      : "trust-aware-v1",
    bucketKey
  };
}

function hasFreshCondition(conditions: CityConditionSummary[]) {
  return conditions.length > 0 && conditions.every((condition) => !condition.expired);
}

function hasPlaceEvidence(candidate: TrafficCandidate) {
  return Boolean(candidate.address && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng));
}

function trustAdjustment(candidate: TrafficCandidate, conditions: CityConditionSummary[]) {
  let delta = 0;
  const reasons: string[] = [];
  const source = candidate.source ?? "database";

  if (candidate.confidence < 55) {
    delta -= 3;
    reasons.push("low-confidence");
  }

  if (candidate.freshnessScore < 45) {
    delta -= 2;
    reasons.push("stale-source");
  }

  if (TREND_ONLY_SOURCES.has(source) && !candidate.routeEligible) {
    delta -= 4;
    reasons.push("trend-only-unconfirmed");
  }

  if (TRUST_AUTHORITY_SOURCES.has(source) && hasPlaceEvidence(candidate)) {
    delta += 2;
    reasons.push("verified-place-evidence");
  }

  if (candidate.sourceSignals.length > 0 && hasFreshCondition(conditions)) {
    delta += 1;
    reasons.push("fresh-city-evidence");
  }

  return {
    delta,
    reason: reasons.join(",") || "neutral"
  };
}

export function applyRecommendationExperiment(
  candidates: TrafficCandidate[],
  experiment: RecommendExperimentMeta,
  conditions: CityConditionSummary[]
) {
  if (experiment.variant === "control") {
    return candidates.map((candidate) => ({
      ...candidate,
      features: {
        ...candidate.features,
        experiment: {
          name: experiment.name,
          variant: experiment.variant,
          trustAdjustment: 0,
          trustReason: "control"
        }
      }
    }));
  }

  return candidates
    .map((candidate) => {
      const adjustment = trustAdjustment(candidate, conditions);
      const adjustedScore = clamp(candidate.adjustedScore + adjustment.delta);

      return {
        ...candidate,
        adjustedScore,
        features: {
          ...candidate.features,
          experiment: {
            name: experiment.name,
            variant: experiment.variant,
            trustAdjustment: adjustment.delta,
            trustReason: adjustment.reason
          }
        }
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

export const __testing = {
  hashBucket,
  trustAdjustment
};
