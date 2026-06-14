import type { CandidateType } from "@/server/recommendation/types";

export type CandidateQualityInput = {
  name: string;
  type: CandidateType;
  source?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
};

export type CandidateQuality = {
  qualityScore: number;
  qualityFlags: string[];
  routeEligible: boolean;
};

const GENERIC_SOCIAL_PATTERN =
  /合集|汇总|攻略|地图|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|无法超越|\d+\D{0,4}个地方|\d+\+?个|\d+家/i;
const SOCIAL_SIGNAL_SOURCES = new Set(["xiaohongshu", "bilibili", "trends-hub"]);
const DIRECT_SIGNAL_ONLY_SOURCES = new Set(["xiaohongshu"]);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isFiniteCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasAddress(value?: string | null) {
  return Boolean(value?.trim());
}

export function isGenericSocialContent(input: {
  source?: string | null;
  title: string;
  tags?: string[];
}) {
  if (!input.source || !SOCIAL_SIGNAL_SOURCES.has(input.source)) {
    return false;
  }

  return GENERIC_SOCIAL_PATTERN.test([input.title, ...(input.tags ?? [])].join(" "));
}

function isGenericSocial(input: CandidateQualityInput) {
  return isGenericSocialContent({
    source: input.source,
    title: input.name,
    tags: input.tags
  });
}

export function assessCandidateQuality(input: CandidateQualityInput): CandidateQuality {
  const flags: string[] = [];
  const addressable = hasAddress(input.address);
  const hasCoords = isFiniteCoordinate(input.lat) && isFiniteCoordinate(input.lng);
  const genericSocial = isGenericSocial(input);
  const directSignalOnly = Boolean(input.source && DIRECT_SIGNAL_ONLY_SOURCES.has(input.source));
  let score = 50;

  if (addressable) {
    score += 20;
  } else {
    score -= 20;
    flags.push("missing_address");
  }

  if (hasCoords) {
    score += 25;
  } else {
    score -= 20;
    flags.push("missing_coords");
  }

  if (input.source === "amap-poi") {
    score += 10;
  } else if (input.source === "shanghai-gov") {
    score += 8;
  }

  if (genericSocial) {
    score -= 45;
    flags.unshift("generic_social");
  }

  if (directSignalOnly) {
    score = Math.min(score, 35);
    flags.unshift("social_signal_only");
  }

  const qualityScore = clampScore(score);

  return {
    qualityScore,
    qualityFlags: [...new Set(flags)],
    routeEligible: !directSignalOnly && !genericSocial && qualityScore >= 55 && (addressable || hasCoords)
  };
}

export function routeEligibilityFromQuality(input: {
  qualityScore?: number | null;
  qualityFlags?: string[] | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const flags = input.qualityFlags ?? [];
  const score = input.qualityScore ?? 50;

  return (
    !flags.includes("social_signal_only") &&
    !flags.includes("generic_social") &&
    score >= 55 &&
    (hasAddress(input.address) || (isFiniteCoordinate(input.lat) && isFiniteCoordinate(input.lng)))
  );
}

// ticket_noise (scenic-spot admission / guided-tour SKUs) is a soft penalty:
// the event can still be route-eligible once a venue is matched, but ranks below
// real shows. Used by the ranker, not the eligibility gate.
export function hasTicketNoiseFlag(flags?: string[] | null) {
  return Boolean(flags?.includes("ticket_noise"));
}
