import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { loadUserRecommendationSignals } from "@/server/recommendation/user-signals";
import { getCityProfile } from "@/server/recommendation/city-profile";
import {
  loadUserProfile,
  recomputeUserProfile,
  type UserProfileSnapshot
} from "@/server/recommendation/user-profile-v2";

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
export type TagStatus = "approved" | "disapproved" | "pending" | "skipped";
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
  profileSnapshot?: UserProfileSnapshot;
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
 * Scoring per dimension (以 NEUTRAL_SCORE=50 为基线，三源叠加为正向加分)：
 *   - explicit: 每个命中的 approved tag +15（上限 35）
 *   - implicit:  命中 tag 的隐式权重之和 × 10（上限 15）
 *   - city:      命中 tag 的城市 heatScore 均值 × 0.35
 * Final = clamp(NEUTRAL_SCORE + explicit + implicit + city, 0, 100)。
 * 三源全空 → NEUTRAL_SCORE (50)。
 */
export function computeDimensionScores(input: {
  explicitApproved: Record<string, number>;
  explicitDisapproved?: Record<string, number>;
  implicitTagWeights: Map<string, number>;
  cityTopTags?: { label: string; value: number }[];
}): DimensionScore[] {
  const {
    explicitApproved,
    explicitDisapproved = {},
    implicitTagWeights
  } = input;

  return DIMENSIONS.map((dimension) => {
    const tagSet = new Set(dimension.tags);
    const matchedTags: string[] = [];

    // 维度标签匹配：支持子串包含（双向）。
    // 城市热度/平台返回的标签常为复合词（如"展览休闲"），维度定义的是原子词（如"展览"）；
    // 精确匹配会让这些标签无法贡献到任何维度，导致雷达图不随表态变化。
    function tagMatchesDimension(tag: string): boolean {
      if (tagSet.has(tag)) return true;
      return dimension.tags.some(
        (dimTag) => tag.includes(dimTag) || dimTag.includes(tag)
      );
    }

    let explicitPositive = 0;
    let explicitNegative = 0;
    for (const tag of Object.keys(explicitApproved)) {
      if (tagMatchesDimension(tag)) {
        explicitPositive += 15;
        matchedTags.push(tag);
      }
    }
    for (const tag of Object.keys(explicitDisapproved)) {
      if (tagMatchesDimension(tag)) {
        explicitNegative += 15;
        if (!matchedTags.includes(tag)) matchedTags.push(tag);
      }
    }
    explicitPositive = Math.min(35, explicitPositive);
    explicitNegative = Math.min(35, explicitNegative);

    let implicitSum = 0;
    for (const [tag, weight] of implicitTagWeights) {
      if (tagMatchesDimension(tag)) {
        implicitSum += weight;
        if (!matchedTags.includes(tag)) matchedTags.push(tag);
      }
    }
    const implicitScore = Math.max(-20, Math.min(20, implicitSum * 10));
    const value = clampScore(NEUTRAL_SCORE + explicitPositive - explicitNegative + implicitScore);

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

  // v1 数据存放在 metadata.tags 子键下（与 v2 的 metadata.profile 分离）。
  // 向后兼容：若没有 tags 子键但顶层是 v1 结构（approvedTags 等），按扁平 v1 读取。
  const root = raw as Record<string, unknown>;
  const value =
    (root.tags && typeof root.tags === "object"
      ? (root.tags as Partial<PreferenceMetadata>)
      : (root as Partial<PreferenceMetadata>));

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
      const order: Record<TagStatus, number> = { pending: 0, skipped: 1, approved: 2, disapproved: 3 };
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

  const [preference, implicitSignals, cityProfile, unifiedProfile] = await Promise.all([
    prisma.userPreference
      .findUnique({ where: { userId } })
      .catch(() => null),
    loadUserRecommendationSignals(userId),
    getCityProfile({ city, area }),
    loadUserProfile(userId)
  ]);

  const metadata = readMetadata(preference?.metadata);
  const explicitApproved = Object.fromEntries(
    unifiedProfile.explicitTags.approved.map((tag) => [tag, 1])
  );
  const explicitDisapproved = Object.fromEntries(
    unifiedProfile.explicitTags.disapproved.map((tag) => [tag, -1])
  );
  const approvedSource = unifiedProfile.explicitTags.approved.length > 0
    ? explicitApproved
    : metadata.approvedTags;
  const disapprovedSource = unifiedProfile.explicitTags.disapproved.length > 0
    ? explicitDisapproved
    : metadata.disapprovedTags;
  const unifiedTagWeights = new Map<string, number>();
  for (const weight of unifiedProfile.positiveWeights.filter((item) => item.dimension === "tag")) {
    unifiedTagWeights.set(weight.key, (unifiedTagWeights.get(weight.key) ?? 0) + weight.weight / 10);
  }
  for (const weight of unifiedProfile.negativeWeights.filter((item) => item.dimension === "tag")) {
    unifiedTagWeights.set(weight.key, (unifiedTagWeights.get(weight.key) ?? 0) - weight.weight / 10);
  }
  const implicitTagWeights = unifiedTagWeights.size > 0 ? unifiedTagWeights : implicitSignals.tagWeights;
  const candidateTags = fuseCandidateTags({
    explicitApproved: approvedSource,
    explicitDisapproved: disapprovedSource,
    implicitTagWeights,
    cityTopTags: cityProfile.topTags.slice(0, CITY_TAG_FALLBACK_LIMIT)
  })
    .filter((candidate) => !unifiedProfile.explicitTags.skipped.includes(candidate.tag))
    .slice(0, CANDIDATE_LIMIT);

  const approvedTags = Object.keys(approvedSource);
  const disapprovedTags = Object.keys(disapprovedSource);
  const pendingCount = candidateTags.filter((c) => c.status === "pending").length;
  const dimensions = computeDimensionScores({
    explicitApproved: approvedSource,
    explicitDisapproved: disapprovedSource,
    implicitTagWeights
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
      implicitTagCount: implicitTagWeights.size,
      hasHistory: unifiedProfile.sampleSize > 0 || preference !== null
    },
    generatedAt,
    profileSnapshot: unifiedProfile
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

  const now = new Date();
  const actionName = action === "approve" ? "tag_approve" : action === "disapprove" ? "tag_disapprove" : "tag_skip";
  const weight = action === "approve" ? 2 : action === "disapprove" ? -2 : 0;
  await prisma.userInteraction.create({
    data: {
      userId,
      action: actionName,
      weight,
      signalKind: "explicit_tag",
      signalKey: `explicit:${userId}:${now.getTime()}:${trimmedTag}:${action}`,
      context: toJson({ tags: [trimmedTag], explicitAction: action })
    }
  });

  const existing = await prisma.userPreference
    .findUnique({ where: { userId } })
    .catch(() => null);

  // read-modify-write：保留 metadata 中其他子键（如 v2 的 metadata.profile），
  // 只更新 metadata.tags 子键。旧数据（扁平结构）会被迁移到 tags 子键。
  const storedRoot =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
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
  // 合并：保留其他子键，覆盖 tags 子键。
  const mergedMetadata = { ...storedRoot, tags: toJson(metadata) };
  const data = {
    userId,
    interests: approvedTags,
    metadata: toJson(mergedMetadata)
  };

  await prisma.userPreference.upsert({
    where: { userId },
    create: data,
    update: { interests: approvedTags, metadata: data.metadata }
  });
  await recomputeUserProfile(userId);

  return { ok: true, status };
}
