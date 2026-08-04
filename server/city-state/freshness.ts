import type { CityConditionDraft } from "@/server/city-state/types";

const FRESHNESS_TTL_MS = 30 * 60 * 1000;

export type FreshnessSource = {
  name: string;
  latestAt?: Date | string | null;
  count?: number;
};

function toTime(value?: Date | string | null) {
  if (!value) {
    return undefined;
  }

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
}

function ageMinutes(value?: Date | string | null, now = Date.now()) {
  const time = toTime(value);

  return time ? Math.max(0, Math.round((now - time) / 60_000)) : undefined;
}

function scoreFromAge(minutes?: number) {
  if (minutes === undefined) return 32;
  if (minutes <= 30) return 94;
  if (minutes <= 120) return 82;
  if (minutes <= 480) return 68;
  if (minutes <= 1_440) return 52;
  return 34;
}

function labelForScore(score: number) {
  if (score >= 85) return "刚刷新";
  if (score >= 68) return "较新";
  if (score >= 48) return "可用但需复核";
  return "偏旧";
}

export function buildFreshnessCondition(input: {
  city: string;
  area?: string;
  sources: FreshnessSource[];
  now?: Date;
}): CityConditionDraft {
  const now = input.now ?? new Date();
  const sourceAges = input.sources.map((source) => ({
    ...source,
    ageMinutes: ageMinutes(source.latestAt, now.getTime())
  }));
  const newestAge = sourceAges
    .map((source) => source.ageMinutes)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0];
  const score = scoreFromAge(newestAge);
  const activeSourceCount = sourceAges.filter((source) => (source.count ?? 0) > 0 || source.latestAt).length;

  return {
    city: input.city,
    area: input.area,
    condition: "freshness",
    score,
    label: labelForScore(score),
    source: "citysense-freshness",
    confidence: activeSourceCount === 0 ? 0.22 : Math.min(0.86, 0.42 + activeSourceCount * 0.1),
    metadata: {
      newestAgeMinutes: newestAge,
      sources: sourceAges
    },
    capturedAt: now,
    expiresAt: new Date(now.getTime() + FRESHNESS_TTL_MS)
  };
}

export const __testing = {
  buildFreshnessCondition
};
