import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { loadUserRecommendationSignals } from "@/server/recommendation/user-signals";
import { getCityProfile } from "@/server/recommendation/city-profile";

/**
 * Per-user interest profile, built from three fused sources:
 *   1. explicit approvals/disapprovals (this module writes them)
 *   2. implicit signals from feedback (reuses loadUserRecommendationSignals)
 *   3. city-wide hot tags from 小红书 CitySignal (reuses getCityProfile) as a
 *      candidate pool for new users with no history yet.
 *
 * All preference state lives in `UserPreference.metadata` (zero schema migration).
 */

export type TagSource = "explicit" | "implicit" | "city";
export type TagStatus = "approved" | "disapproved" | "pending";
export type TagAction = "approve" | "disapprove" | "skip";

export type TagCandidate = {
  tag: string;
  /** Where this tag surfaced from. A tag can appear from multiple sources;
   * we report the strongest one (explicit > implicit > city). */
  source: TagSource;
  /** Normalized 0-100 relevance signal used for ordering. */
  score: number;
  status: TagStatus;
  /** Raw context for display, e.g. "城市热度 79" or "隐式反馈 +0.3". */
  context: string;
};

export type UserProfileStats = {
  approvedCount: number;
  disapprovedCount: number;
  pendingCount: number;
  implicitTagCount: number;
  hasHistory: boolean;
};

export type UserProfileResponse = {
  userId: string;
  city: string;
  area?: string;
  candidateTags: TagCandidate[];
  approvedTags: string[];
  disapprovedTags: string[];
  dimensions: DimensionScore[];
  stats: UserProfileStats;
  generatedAt: string;
};

/**
 * Six taste dimensions for the radar chart. Each dimension aggregates a set of
 * related tags. Aligned with the THEME_TAGS classification in route-builder.ts
 * so the chart reflects the same interest taxonomy the recommender uses.
 */
export type DimensionKey =
  | "culture"
  | "coffee"
  | "nightlife"
  | "marketFood"
  | "trend"
  | "quiet";

export type DimensionScore = {
  key: DimensionKey;
  label: string;
  /** Normalized 0-100 strength. */
  value: number;
  /** The tags that contributed to this dimension's score (for tooltips). */
  topTags: string[];
};

export const DIMENSIONS: { key: DimensionKey; label: string; tags: string[] }[] = [
  {
    key: "culture",
    label: "文化静思",
    tags: ["书店", "展览", "艺术", "文化", "漫画", "美术馆", "画廊"]
  },
  {
    key: "coffee",
    label: "咖啡生活",
    tags: ["咖啡", "咖啡厅", "咖啡馆", "咖啡品鉴"]
  },
  {
    key: "nightlife",
    label: "夜生活",
    tags: ["独立音乐", "livehouse", "Livehouse", "酒吧", "演出", "音乐", "夜生活"]
  },
  {
    key: "marketFood",
    label: "市集美食",
    tags: ["市集", "快闪", "美食", "餐饮", "烘焙", "甜点", "小吃"]
  },
  {
    key: "trend",
    label: "热门潮流",
    tags: ["热门", "热度", "潮流", "活动", "体育休闲", "购物", "同城"]
  },
  {
    key: "quiet",
    label: "安静独处",
    tags: ["安静", "solo", "书店", "漫画"]
  }
];

const NEUTRAL_SCORE = 50;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Compute the six dimension scores from the three fused tag sources.
 * Pure function — exported for unit testing without a database.
 *
 * Scoring per dimension:
 *   - explicit: each approved tag matching the dimension adds 30 (cap 90)
 *   - implicit:  sum of implicit tag weights for matching tags × 25
 *   - city:      mean of city heatScore for matching tags × 0.35
 * Final = clamp(explicit + implicit + city, 0, 100).
 * If all three sources are empty for a dimension → NEUTRAL_SCORE (50).
 */
export function computeDimensionScores(input: {
  explicitApproved: Record<string, number>;
  implicitTagWeights: Map<string, number>;
  cityTopTags: { label: string; value: number }[];
}): DimensionScore[] {
  const { explicitApproved, implicitTagWeights, cityTopTags } = input;
  const cityHeatByTag = new Map<string, number>();
  for (const metric of cityTopTags) {
    cityHeatByTag.set(metric.label, metric.value);
  }

  return DIMENSIONS.map((dimension) => {
    const tagSet = new Set(dimension.tags);
    const matchedTags: string[] = [];

    // Explicit approved tags — strongest signal, capped so multi-tag dimensions
    // don't saturate instantly.
    let explicitScore = 0;
    for (const tag of Object.keys(explicitApproved)) {
      if (tagSet.has(tag)) {
        explicitScore += 15;
        matchedTags.push(tag);
      }
    }
    explicitScore = Math.min(35, explicitScore);

    // Implicit feedback weights.
    let implicitSum = 0;
    for (const [tag, weight] of implicitTagWeights) {
      if (tagSet.has(tag) && weight > 0) {
        implicitSum += weight;
        if (!matchedTags.includes(tag)) matchedTags.push(tag);
      }
    }
    const implicitScore = Math.min(15, implicitSum * 10);

    // City heat average across matching tags present in city topTags.
    let citySum = 0;
    let cityCount = 0;
    for (const tag of dimension.tags) {
      const heat = cityHeatByTag.get(tag);
      if (typeof heat === "number") {
        citySum += heat;
        cityCount += 1;
        if (!matchedTags.includes(tag)) matchedTags.push(tag);
      }
    }
    const cityScore = cityCount > 0 ? (citySum / cityCount) * 0.35 : 0;

    const hasAnySignal = explicitScore > 0 || implicitScore > 0 || cityScore > 0;
    // NEUTRAL_SCORE is the baseline; the three sources are additive bonuses
    // so any positive signal lifts the dimension above neutral, never below.
    const value = hasAnySignal
      ? clampScore(NEUTRAL_SCORE + explicitScore + implicitScore + cityScore)
      : NEUTRAL_SCORE;

    return {
      key: dimension.key,
      label: dimension.label,
      value,
      topTags: matchedTags.slice(0, 5)
    };
  });
}

type PreferenceMetadata = {
  approvedTags: Record<string, number>;
  disapprovedTags: Record<string, number>;
  tagHistory: { tag: string; action: TagAction; at: string }[];
  version: number;
};

const METADATA_VERSION = 1;
const CITY_TAG_FALLBACK_LIMIT = 12;
const CANDIDATE_LIMIT = 20;

function emptyMetadata(): PreferenceMetadata {
  return {
    approvedTags: {},
    disapprovedTags: {},
    tagHistory: [],
    version: METADATA_VERSION
  };
}

function readMetadata(raw: unknown): PreferenceMetadata {
  if (!raw || typeof raw !== "object") {
    return emptyMetadata();
  }

  const value = raw as Partial<PreferenceMetadata>;
  return {
    approvedTags:
      value.approvedTags && typeof value.approvedTags === "object"
        ? (value.approvedTags as Record<string, number>)
        : {},
    disapprovedTags:
      value.disapprovedTags && typeof value.disapprovedTags === "object"
        ? (value.disapprovedTags as Record<string, number>)
        : {},
    tagHistory: Array.isArray(value.tagHistory) ? value.tagHistory : [],
    version: METADATA_VERSION
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Fuse the three tag sources into a single ranked candidate list.
 * Pure function — exported for unit testing without a database.
 */
export function fuseCandidateTags(input: {
  explicitApproved: Record<string, number>;
  explicitDisapproved: Record<string, number>;
  implicitTagWeights: Map<string, number>;
  cityTopTags: { label: string; value: number }[];
}): TagCandidate[] {
  const { explicitApproved, explicitDisapproved, implicitTagWeights, cityTopTags } = input;
  const merged = new Map<
    string,
    { sources: Set<TagSource>; maxScore: number; status: TagStatus; contexts: string[] }
  >();

  function upsert(
    tag: string,
    source: TagSource,
    score: number,
    status: TagStatus,
    context: string
  ) {
    const existing = merged.get(tag);
    if (existing) {
      existing.sources.add(source);
      existing.maxScore = Math.max(existing.maxScore, score);
      existing.contexts.push(context);
      // Stronger status wins: explicit > implicit > city. approved/disapproved from explicit lock it.
      if (source === "explicit") {
        existing.status = status;
      }
    } else {
      merged.set(tag, {
        sources: new Set([source]),
        maxScore: score,
        status,
        contexts: [context]
      });
    }
  }

  for (const [tag, confidence] of Object.entries(explicitApproved)) {
    upsert(tag, "explicit", Math.round(confidence * 100), "approved", `显式认可 ${confidence.toFixed(2)}`);
  }
  for (const [tag, confidence] of Object.entries(explicitDisapproved)) {
    upsert(tag, "explicit", Math.round(Math.abs(confidence) * 100), "disapproved", `显式不认可 ${confidence.toFixed(2)}`);
  }
  for (const [tag, weight] of implicitTagWeights) {
    if (weight === 0) continue;
    const score = Math.min(100, Math.round(Math.abs(weight) * 50));
    const status: TagStatus = weight > 0 ? "approved" : "disapproved";
    upsert(tag, "implicit", score, status, `隐式反馈 ${weight > 0 ? "+" : ""}${weight.toFixed(2)}`);
  }
  for (const metric of cityTopTags) {
    upsert(metric.label, "city", Math.round(metric.value), "pending", `城市热度 ${metric.value}`);
  }

  return [...merged.entries()]
    .map(([tag, info]) => {
      // Source priority for display: explicit > implicit > city
      const source: TagSource = info.sources.has("explicit")
        ? "explicit"
        : info.sources.has("implicit")
          ? "implicit"
          : "city";
      return {
        tag,
        source,
        score: info.maxScore,
        status: info.status,
        context: info.contexts.join(" · ")
      };
    })
    .sort((a, b) => {
      // Pending first (those the user hasn't decided on yet), then approved, then disapproved.
      const order: Record<TagStatus, number> = { pending: 0, approved: 1, disapproved: 2 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return b.score - a.score;
    });
}

/**
 * Load a user's fused interest profile. Falls back gracefully:
 * - no userId history → only city tags (new-user onboarding)
 * - DB read failure → empty metadata treated as new user
 */
export async function getUserProfile(input: {
  userId: string;
  city: string;
  area?: string;
}): Promise<UserProfileResponse> {
  const generatedAt = new Date().toISOString();
  const { userId, city, area } = input;

  const [preference, implicitSignals, cityProfile] = await Promise.all([
    prisma.userPreference
      .findUnique({ where: { userId } })
      .catch(() => null),
    loadUserRecommendationSignals(userId),
    getCityProfile({ city, area })
  ]);

  const metadata = readMetadata(preference?.metadata);
  const candidateTags = fuseCandidateTags({
    explicitApproved: metadata.approvedTags,
    explicitDisapproved: metadata.disapprovedTags,
    implicitTagWeights: implicitSignals.tagWeights,
    cityTopTags: cityProfile.topTags.slice(0, CITY_TAG_FALLBACK_LIMIT)
  }).slice(0, CANDIDATE_LIMIT);

  const approvedTags = Object.keys(metadata.approvedTags);
  const disapprovedTags = Object.keys(metadata.disapprovedTags);
  const pendingCount = candidateTags.filter((c) => c.status === "pending").length;
  const dimensions = computeDimensionScores({
    explicitApproved: metadata.approvedTags,
    implicitTagWeights: implicitSignals.tagWeights,
    cityTopTags: cityProfile.topTags.slice(0, CITY_TAG_FALLBACK_LIMIT)
  });

  return {
    userId,
    city,
    area,
    candidateTags,
    approvedTags,
    disapprovedTags,
    dimensions,
    stats: {
      approvedCount: approvedTags.length,
      disapprovedCount: disapprovedTags.length,
      pendingCount,
      implicitTagCount: implicitSignals.tagWeights.size,
      hasHistory: preference !== null || implicitSignals.tagWeights.size > 0
    },
    generatedAt
  };
}

/**
 * Record a user's explicit tag preference. Upserts UserPreference,
 * updates metadata maps + tagHistory, and syncs the `interests` array
 * (which the existing recommendation pipeline already reads).
 *
 * `skip` is recorded in history but does not change approved/disapproved maps.
 */
export async function setTagPreference(input: {
  userId: string;
  tag: string;
  action: TagAction;
}): Promise<{ ok: true; status: TagStatus }> {
  const { userId, tag, action } = input;
  const trimmedTag = tag.trim();

  if (!trimmedTag) {
    throw new Error("tag must not be empty");
  }

  const existing = await prisma.userPreference
    .findUnique({ where: { userId } })
    .catch(() => null);

  const metadata = readMetadata(existing?.metadata);
  metadata.tagHistory.push({ tag: trimmedTag, action, at: new Date().toISOString() });
  // Cap history to avoid unbounded growth.
  if (metadata.tagHistory.length > 200) {
    metadata.tagHistory = metadata.tagHistory.slice(-200);
  }

  let status: TagStatus = "pending";
  if (action === "approve") {
    // Confidence grows with repeated approvals, capped at 1.
    const prev = metadata.approvedTags[trimmedTag] ?? 0.3;
    metadata.approvedTags[trimmedTag] = Math.min(1, prev + 0.25);
    delete metadata.disapprovedTags[trimmedTag];
    status = "approved";
  } else if (action === "disapprove") {
    const prev = metadata.disapprovedTags[trimmedTag] ?? -0.3;
    metadata.disapprovedTags[trimmedTag] = Math.max(-1, prev - 0.25);
    delete metadata.approvedTags[trimmedTag];
    status = "disapproved";
  }
  // skip: status stays pending, only history updated.

  const approvedTags = Object.keys(metadata.approvedTags);
  const data = {
    userId,
    interests: approvedTags,
    metadata: toJson(metadata)
  };

  await prisma.userPreference.upsert({
    where: { userId },
    create: data,
    update: { interests: approvedTags, metadata: data.metadata }
  });

  return { ok: true, status };
}
