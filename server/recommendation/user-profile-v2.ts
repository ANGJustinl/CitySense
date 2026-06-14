import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { Candidate } from "@/server/recommendation/types";

/**
 * TASK2-P0-001：用户品味画像闭环。
 *
 * 设计约束（见 docs/tasks-2.md 审批结论 2026-06-14 angjustinl）：
 *
 * 1. RecommendationFeedback 是站内反馈事实源，UserInteraction 是镜像/导入/兼容层。
 *    重算画像时必须去重，不能把同一次 feedback 双算。实现上 recompute 以 UserInteraction
 *    为读取入口（它携带 tags/source 等维度上下文），但按 (recommendationId, routeId, itemId)
 *    去重，一次反馈对一个 item 只计一次。
 * 2. 授权导入类 interaction（action ∈ {liked,saved,rated,watched,followed}）走单独累加通道，
 *    与站内反馈 action（up/down/save/dismiss）命名空间隔离，天然不双算。
 * 3. 单次 down/dismiss 只做短期 route/item 级惩罚；泛化到 tag/source/area 的负偏好必须满足
 *    负样本 >=2、更快衰减、硬上限。
 * 4. 无画像 / 读取失败 / 匿名用户 → 回退空画像，不抛错，保持推荐接口可用。
 */

export const PROFILE_VERSION = 1;
export const PROFILE_DECAY_WINDOW_DAYS = 90;
export const PROFILE_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const PROFILE_EXPOSURE_WINDOW_DAYS = 14;

// 分层负偏好约束（约束 3）。
export const NEGATIVE_PREFERENCE_MIN_SAMPLES = 2;
export const NEGATIVE_PREFERENCE_HARD_CAP = 30;
// 正偏好单项硬上限，防止单一信号主导。
export const POSITIVE_PREFERENCE_HARD_CAP = 60;
// affinity 归一化：50 为中性，正偏好上探，负偏好下探。
export const AFFINITY_NEUTRAL = 50;

const FEEDBACK_ACTIONS = new Set(["up", "down", "save", "dismiss"]);
const IMPORT_ACTIONS = new Set(["liked", "saved", "rated", "watched", "followed"]);

// 站内反馈到维度权重的映射（方向与 feedback.ts feedbackToInteractionWeight 对齐）。
const FEEDBACK_ACTION_WEIGHT: Record<string, number> = {
  up: 1,
  save: 1.5,
  down: -1.5,
  dismiss: -0.8
};

// 授权导入到维度权重的映射（E：AuthorizedTasteImport 用）。
const IMPORT_ACTION_WEIGHT: Record<string, number> = {
  liked: 1,
  saved: 1.4,
  rated: 1.2,
  watched: 0.8,
  followed: 1
};

// 时间衰减：正反馈 1/7/30/90 天 → 1/0.72/0.42/0.18。
function positiveDecay(ageDays: number) {
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.72;
  if (ageDays <= 30) return 0.42;
  return 0.18;
}

// 时间衰减：负反馈更快衰减（约束 3）→ 1/0.5/0.2/0.05。
function negativeDecay(ageDays: number) {
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.5;
  if (ageDays <= 30) return 0.2;
  return 0.05;
}

export type PreferenceDimension = "tag" | "source" | "area" | "budget" | "quietness" | "mood";

export type PreferenceWeight = {
  dimension: PreferenceDimension;
  key: string;
  // 正偏好：[0, POSITIVE_PREFERENCE_HARD_CAP]，幅度表达。
  // 负偏好：[0, NEGATIVE_PREFERENCE_HARD_CAP]，幅度表达（sign 在惩罚计算时还原）。
  weight: number;
  sampleSize: number;
};

export type UserProfileSnapshot = {
  profileVersion: number;
  updatedFrom: string;
  generatedAt: string;
  sampleSize: number;
  decayWindowDays: number;
  confidence: "low" | "medium" | "high";
  positiveWeights: PreferenceWeight[];
  negativeWeights: PreferenceWeight[];
  sourceAffinity: number;
  areaAffinity: number;
  budgetAffinity: number;
  quietnessAffinity: number;
  moodAffinity: Record<string, number>;
  recentExposure: {
    itemIds: string[];
    routeTitles: string[];
    windowDays: number;
    capturedAt: string;
  };
  topReasons: string[];
};

export const EMPTY_USER_PROFILE: UserProfileSnapshot = {
  profileVersion: PROFILE_VERSION,
  updatedFrom: "empty",
  generatedAt: new Date(0).toISOString(),
  sampleSize: 0,
  decayWindowDays: PROFILE_DECAY_WINDOW_DAYS,
  confidence: "low",
  positiveWeights: [],
  negativeWeights: [],
  sourceAffinity: AFFINITY_NEUTRAL,
  areaAffinity: AFFINITY_NEUTRAL,
  budgetAffinity: AFFINITY_NEUTRAL,
  quietnessAffinity: AFFINITY_NEUTRAL,
  moodAffinity: {},
  recentExposure: {
    itemIds: [],
    routeTitles: [],
    windowDays: PROFILE_EXPOSURE_WINDOW_DAYS,
    capturedAt: new Date(0).toISOString()
  },
  topReasons: []
};

type WeightedDimensionRow = {
  dimension: PreferenceDimension;
  key: string;
  rawWeight: number;
  sampleSize: number;
};

type AffinityBucket = {
  tag: Record<string, number>;
  source: Record<string, number>;
  area: Record<string, number>;
};

function readContext(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function contextTags(context: unknown): string[] {
  const value = readContext(context);
  if (!Array.isArray(value.tags)) {
    return [];
  }
  return value.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}

function contextSource(context: unknown): string | undefined {
  const value = readContext(context);
  return typeof value.source === "string" && value.source.trim().length > 0
    ? value.source
    : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bucketFor(bucket: Record<string, number>, key: string, weight: number) {
  bucket[key] = (bucket[key] ?? 0) + weight;
}

function addDimension(
  rows: Map<string, WeightedDimensionRow>,
  dimension: PreferenceDimension,
  key: string | undefined,
  rawWeight: number
) {
  if (!key || rawWeight === 0) {
    return;
  }
  const mapKey = `${dimension}:${key}`;
  const existing = rows.get(mapKey);
  if (existing) {
    existing.rawWeight += rawWeight;
    existing.sampleSize += 1;
  } else {
    rows.set(mapKey, { dimension, key, rawWeight, sampleSize: 1 });
  }
}

function confidenceFor(sampleSize: number): UserProfileSnapshot["confidence"] {
  if (sampleSize < 5) return "low";
  if (sampleSize < 15) return "medium";
  return "high";
}

function aggregateAffinityScore(bucket: AffinityBucket): number {
  const all = [...Object.values(bucket.tag), ...Object.values(bucket.source), ...Object.values(bucket.area)];
  if (all.length === 0) {
    return AFFINITY_NEUTRAL;
  }
  const sum = all.reduce((acc, value) => acc + value, 0);
  return clamp(Math.round(AFFINITY_NEUTRAL + sum / all.length), 0, 100);
}

function buildTopReasons(
  positive: PreferenceWeight[],
  negative: PreferenceWeight[],
  exposure: { itemIds: string[]; routeTitles: string[] }
): string[] {
  const reasons: string[] = [];
  for (const weight of positive.slice(0, 3)) {
    reasons.push(`${weight.dimension}:${weight.key} +${weight.weight}`);
  }
  for (const weight of negative.slice(0, 2)) {
    reasons.push(`${weight.dimension}:${weight.key} -${weight.weight}`);
  }
  if (exposure.itemIds.length > 0) {
    reasons.push(`recentlySeen:${exposure.itemIds.length} items`);
  }
  return reasons;
}

/**
 * 关键去重（约束 1）：一次反馈对同一 item 只计一次。
 * 同一 (recommendationId, routeId, itemId) 可能因历史重复 mirror 产生多条 interaction；
 * 只保留最早一条。授权导入类（非 feedback action）命名空间隔离，不参与此去重。
 */
function dedupeFeedbackInteractions<
  T extends {
    recommendationId: string | null;
    routeId: string | null;
    itemId: string | null;
    action: string;
    createdAt: Date;
  }
>(interactions: T[]): T[] {
  const seen = new Set<string>();
  const ascending = [...interactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: T[] = [];
  for (const interaction of ascending) {
    if (!FEEDBACK_ACTIONS.has(interaction.action)) {
      // 授权导入类：命名空间隔离，直接保留（约束 2）。
      out.push(interaction);
      continue;
    }
    const key = [
      interaction.recommendationId ?? "",
      interaction.routeId ?? "",
      interaction.itemId ?? ""
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(interaction);
  }
  return out;
}

function normalizeWeightsFromRows(
  rows: Map<string, WeightedDimensionRow>,
  sign: 1 | -1
): PreferenceWeight[] {
  const cap = sign > 0 ? POSITIVE_PREFERENCE_HARD_CAP : NEGATIVE_PREFERENCE_HARD_CAP;
  return [...rows.values()]
    .map((row) => ({
      dimension: row.dimension,
      key: row.key,
      weight: clamp(Math.round(Math.abs(row.rawWeight) * 10) / 10, 0, cap),
      sampleSize: row.sampleSize
    }))
    .sort((a, b) => b.weight - a.weight);
}

function applyNegativeSampleFloor(rows: PreferenceWeight[]): PreferenceWeight[] {
  // 约束 3：泛化负偏好必须负样本 >= 2。
  return rows.filter((row) => row.sampleSize >= NEGATIVE_PREFERENCE_MIN_SAMPLES);
}

function extractExposureFromRoutes(routesJson: unknown): {
  itemIds: string[];
  routeTitles: string[];
} {
  if (!Array.isArray(routesJson)) {
    return { itemIds: [], routeTitles: [] };
  }
  const itemIds = new Set<string>();
  const routeTitles = new Set<string>();
  for (const route of routesJson as Array<Record<string, unknown>>) {
    const title = typeof route.title === "string" ? route.title : undefined;
    const places = Array.isArray(route.places) ? (route.places as Array<Record<string, unknown>>) : [];
    for (const place of places) {
      if (typeof place.id === "string") {
        itemIds.add(place.id);
      }
    }
    if (title) {
      routeTitles.add(title);
    }
  }
  return {
    itemIds: [...itemIds].slice(0, 200),
    routeTitles: [...routeTitles].slice(0, 50)
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 重算用户画像并持久化到 UserPreference.metadata。
 * 异常时返回 EMPTY_USER_PROFILE，不抛错（约束 4）。
 */
export async function recomputeUserProfile(userId: string): Promise<UserProfileSnapshot> {
  if (!userId) {
    return EMPTY_USER_PROFILE;
  }

  try {
    const since = new Date(Date.now() - PROFILE_DECAY_WINDOW_DAYS * 86_400_000);
    const exposureSince = new Date(Date.now() - PROFILE_EXPOSURE_WINDOW_DAYS * 86_400_000);

    const [interactions, logs] = await Promise.all([
      prisma.userInteraction.findMany({
        where: {
          userId,
          createdAt: { gte: since }
        },
        orderBy: { createdAt: "asc" },
        take: 1000
      }),
      prisma.recommendationLog.findMany({
        where: {
          userId,
          createdAt: { gte: exposureSince }
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { recommendedRoutes: true }
      })
    ]);

    const deduped = dedupeFeedbackInteractions(interactions);

    // 单次遍历完成：衰减（按每条 interaction 的 createdAt）+ 维度聚合 + bucket 累加。
    const positiveRows = new Map<string, WeightedDimensionRow>();
    const negativeRows = new Map<string, WeightedDimensionRow>();
    const positiveBucket: AffinityBucket = { tag: {}, source: {}, area: {} };
    let sampleSize = 0;

    for (const interaction of deduped) {
      const isFeedback = FEEDBACK_ACTIONS.has(interaction.action);
      const isImport = IMPORT_ACTIONS.has(interaction.action);
      if (!isFeedback && !isImport) {
        continue;
      }
      const baseWeight =
        interaction.weight ??
        (isFeedback
          ? FEEDBACK_ACTION_WEIGHT[interaction.action] ?? 0
          : IMPORT_ACTION_WEIGHT[interaction.action] ?? 0);
      if (baseWeight === 0) {
        continue;
      }
      sampleSize += 1;

      const ageDays = Math.max(0, (Date.now() - interaction.createdAt.getTime()) / 86_400_000);
      const decay = baseWeight > 0 ? positiveDecay(ageDays) : negativeDecay(ageDays);
      const decayedWeight = baseWeight * decay;

      const targetRows = decayedWeight > 0 ? positiveRows : negativeRows;
      const targetBucket = decayedWeight > 0 ? positiveBucket : null;

      const tags = contextTags(interaction.context);
      const source = contextSource(interaction.context);
      for (const tag of tags) {
        addDimension(targetRows, "tag", tag, decayedWeight);
        if (targetBucket) bucketFor(targetBucket.tag, tag, decayedWeight);
      }
      if (source) {
        addDimension(targetRows, "source", source, decayedWeight);
        if (targetBucket) bucketFor(targetBucket.source, source, decayedWeight);
      }
    }

    const positiveWeights = normalizeWeightsFromRows(positiveRows, 1);
    const negativeWeights = applyNegativeSampleFloor(normalizeWeightsFromRows(negativeRows, -1));

    const exposureItemIds = new Set<string>();
    const exposureRouteTitles = new Set<string>();
    for (const log of logs) {
      const extracted = extractExposureFromRoutes(log.recommendedRoutes);
      for (const id of extracted.itemIds) exposureItemIds.add(id);
      for (const title of extracted.routeTitles) exposureRouteTitles.add(title);
    }
    const recentExposure = {
      itemIds: [...exposureItemIds].slice(0, 200),
      routeTitles: [...exposureRouteTitles].slice(0, 50),
      windowDays: PROFILE_EXPOSURE_WINDOW_DAYS,
      capturedAt: new Date().toISOString()
    };

    const snapshot: UserProfileSnapshot = {
      profileVersion: PROFILE_VERSION,
      updatedFrom: "feedback",
      generatedAt: new Date().toISOString(),
      sampleSize,
      decayWindowDays: PROFILE_DECAY_WINDOW_DAYS,
      confidence: confidenceFor(sampleSize),
      positiveWeights,
      negativeWeights,
      sourceAffinity: aggregateAffinityScore(positiveBucket),
      areaAffinity: AFFINITY_NEUTRAL,
      budgetAffinity: AFFINITY_NEUTRAL,
      quietnessAffinity: AFFINITY_NEUTRAL,
      moodAffinity: {},
      recentExposure,
      topReasons: buildTopReasons(positiveWeights, negativeWeights, recentExposure)
    };

    try {
      // read-modify-write：保留 metadata 中其他子键（如 v1 的 metadata.tags），
      // 只更新 metadata.profile 子键。
      const stored = await prisma.userPreference.findUnique({
        where: { userId },
        select: { metadata: true }
      });
      const storedRoot =
        stored?.metadata && typeof stored.metadata === "object"
          ? (stored.metadata as Record<string, unknown>)
          : {};
      const mergedMetadata = { ...storedRoot, profile: toJson(snapshot) };

      await prisma.userPreference.upsert({
        where: { userId },
        create: {
          userId,
          interests: [],
          metadata: toJson(mergedMetadata)
        },
        update: {
          metadata: toJson(mergedMetadata)
        }
      });
    } catch {
      // 持久化失败不影响内存画像可用性。
    }

    return snapshot;
  } catch {
    return EMPTY_USER_PROFILE;
  }
}

function isStaleSnapshot(snapshot: UserProfileSnapshot | null): boolean {
  if (!snapshot) return true;
  if (snapshot.profileVersion !== PROFILE_VERSION) return true;
  const generatedAt = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedAt)) return true;
  return Date.now() - generatedAt > PROFILE_REFRESH_TTL_MS;
}

function parseStoredMetadata(metadata: unknown): UserProfileSnapshot | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  // v2 数据存放在 metadata.profile 子键下（与 v1 的 metadata.tags 分离）。
  // 向后兼容：若没有 profile 子键但顶层有 profileVersion，按扁平结构读取。
  const root = metadata as Record<string, unknown>;
  const value =
    (root.profile && typeof root.profile === "object"
      ? (root.profile as Partial<UserProfileSnapshot>)
      : (metadata as Partial<UserProfileSnapshot>));
  if (value.profileVersion !== PROFILE_VERSION) {
    return null;
  }
  // 信任我们自己写入的结构；字段缺失时回退到空画像默认值。
  return {
    ...EMPTY_USER_PROFILE,
    ...value,
    recentExposure: {
      ...EMPTY_USER_PROFILE.recentExposure,
      ...(value.recentExposure ?? {})
    }
  } as UserProfileSnapshot;
}

/**
 * 读取用户画像：优先读持久化快照；过期或缺失时重算并写回；任何异常回退空画像。
 * 约束 4：永不抛错。
 */
export async function loadUserProfile(userId: string | undefined): Promise<UserProfileSnapshot> {
  if (!userId) {
    return EMPTY_USER_PROFILE;
  }
  try {
    const stored = await prisma.userPreference.findUnique({
      where: { userId },
      select: { metadata: true }
    });
    const parsed = parseStoredMetadata(stored?.metadata);
    if (parsed && !isStaleSnapshot(parsed)) {
      return parsed;
    }
    return await recomputeUserProfile(userId);
  } catch {
    return EMPTY_USER_PROFILE;
  }
}

/**
 * ranker 一次请求内复用的画像读取结果。无 userId 时直接返回空画像与 degraded 标记，
 * 保证无画像时 ranker 行为与改造前一致（约束 4）。
 */
export async function loadUserProfileForRanking(userId: string | undefined): Promise<{
  profile: UserProfileSnapshot;
  degraded: boolean;
}> {
  if (!userId) {
    return { profile: EMPTY_USER_PROFILE, degraded: true };
  }
  try {
    const profile = await loadUserProfile(userId);
    return { profile, degraded: profile === EMPTY_USER_PROFILE || profile.sampleSize === 0 };
  } catch {
    return { profile: EMPTY_USER_PROFILE, degraded: true };
  }
}

export type ProfileFactor = {
  dimension: PreferenceDimension;
  key: string;
  delta: number;
};

export type AffinityComputation = {
  score: number; // [0,100]，50 为中性
  factors: ProfileFactor[];
  profileHit: boolean;
};

function matchWeight(weights: PreferenceWeight[], dimension: PreferenceDimension, key: string) {
  return weights.find((weight) => weight.dimension === dimension && weight.key === key);
}

/**
 * 基于画像的正偏好 affinity 计算。
 * 输出 [0,100]，50 为中性；同时给出 attribution（约束：可追溯，如 tag:展览 +8）。
 * 当 profile 为空或 sampleSize < 5（低置信）→ 返回中性 50，profileHit=false，保持原行为。
 */
export function calculateUserAffinityFromProfile(
  candidate: Candidate,
  profile: UserProfileSnapshot
): AffinityComputation {
  if (profile.sampleSize < 5) {
    return { score: AFFINITY_NEUTRAL, factors: [], profileHit: false };
  }

  const factors: ProfileFactor[] = [];
  let delta = 0;

  for (const tag of candidate.tags) {
    const weight = matchWeight(profile.positiveWeights, "tag", tag);
    if (weight) {
      // 单 tag 贡献归一到 0~20 的 delta 区间。
      const contribution = clamp(weight.weight / POSITIVE_PREFERENCE_HARD_CAP, 0, 1) * 20;
      delta += contribution;
      factors.push({ dimension: "tag", key: tag, delta: Math.round(contribution * 10) / 10 });
    }
  }

  if (candidate.source) {
    const weight = matchWeight(profile.positiveWeights, "source", candidate.source);
    if (weight) {
      const contribution = clamp(weight.weight / POSITIVE_PREFERENCE_HARD_CAP, 0, 1) * 15;
      delta += contribution;
      factors.push({ dimension: "source", key: candidate.source, delta: Math.round(contribution * 10) / 10 });
    }
  }

  return {
    score: clamp(Math.round(AFFINITY_NEUTRAL + delta), 0, 100),
    factors,
    profileHit: factors.length > 0
  };
}

/**
 * 基于画像的负偏好惩罚。
 * 约束 3：泛化到 tag/source/area 的负偏好已满足 sampleSize>=2、更快衰减、硬上限；
 * 单次 down/dismiss 在 recompute 阶段因 sampleSize<2 已被 applyNegativeSampleFloor 过滤。
 * 输出 [0, NEGATIVE_PREFERENCE_HARD_CAP]，0 表示无惩罚。
 */
export function calculateFeedbackPenaltyFromProfile(
  candidate: Candidate,
  profile: UserProfileSnapshot
): AffinityComputation {
  if (profile.negativeWeights.length === 0) {
    return { score: 0, factors: [], profileHit: false };
  }

  const factors: ProfileFactor[] = [];
  let penalty = 0;

  for (const tag of candidate.tags) {
    const weight = matchWeight(profile.negativeWeights, "tag", tag);
    if (weight) {
      const contribution = clamp(weight.weight / NEGATIVE_PREFERENCE_HARD_CAP, 0, 1) * 12;
      penalty += contribution;
      factors.push({ dimension: "tag", key: tag, delta: -Math.round(contribution * 10) / 10 });
    }
  }

  if (candidate.source) {
    const weight = matchWeight(profile.negativeWeights, "source", candidate.source);
    if (weight) {
      const contribution = clamp(weight.weight / NEGATIVE_PREFERENCE_HARD_CAP, 0, 1) * 8;
      penalty += contribution;
      factors.push({ dimension: "source", key: candidate.source, delta: -Math.round(contribution * 10) / 10 });
    }
  }

  return {
    score: clamp(Math.round(penalty), 0, NEGATIVE_PREFERENCE_HARD_CAP),
    factors,
    profileHit: factors.length > 0
  };
}

/**
 * 曝光惩罚：命中最近曝光 itemId 或 routeTitle 时给 novelty 轻惩罚。
 * 仅轻微影响排序，不过滤候选（验收要求"轻微排序影响"）。
 */
export function calculateExposurePenalty(
  candidate: Candidate,
  profile: UserProfileSnapshot
): { penalty: number; reason?: string } {
  const exposure = profile.recentExposure;
  if (exposure.itemIds.length === 0 && exposure.routeTitles.length === 0) {
    return { penalty: 0 };
  }
  if (exposure.itemIds.includes(candidate.id)) {
    return { penalty: 8, reason: `recentlySeen:itemId ${candidate.id}` };
  }
  if (candidate.name && exposure.routeTitles.some((title) => title.includes(candidate.name))) {
    return { penalty: 4, reason: `recentlySeen:theme ${candidate.name}` };
  }
  return { penalty: 0 };
}

/**
 * 用户可见摘要：只返回派生标签/权重，不返回 raw interactions（隐私）。
 */
export async function getUserProfileSummary(userId: string | undefined) {
  if (!userId) {
    return {
      userId: null,
      profileVersion: PROFILE_VERSION,
      hasProfile: false,
      degraded: true,
      summary: null
    };
  }
  const { profile, degraded } = await loadUserProfileForRanking(userId);
  if (degraded || profile.sampleSize === 0) {
    return {
      userId,
      profileVersion: PROFILE_VERSION,
      hasProfile: false,
      degraded: true,
      summary: null
    };
  }
  return {
    userId,
    profileVersion: PROFILE_VERSION,
    hasProfile: true,
    degraded: false,
    summary: {
      sampleSize: profile.sampleSize,
      confidence: profile.confidence,
      generatedAt: profile.generatedAt,
      decayWindowDays: profile.decayWindowDays,
      topPositiveTags: profile.positiveWeights
        .filter((weight) => weight.dimension === "tag")
        .slice(0, 5)
        .map((weight) => ({ tag: weight.key, weight: weight.weight, sampleSize: weight.sampleSize })),
      topNegativeTags: profile.negativeWeights
        .filter((weight) => weight.dimension === "tag")
        .slice(0, 5)
        .map((weight) => ({ tag: weight.key, weight: weight.weight, sampleSize: weight.sampleSize })),
      topSources: profile.positiveWeights
        .filter((weight) => weight.dimension === "source")
        .slice(0, 3)
        .map((weight) => ({ source: weight.key, weight: weight.weight })),
      topReasons: profile.topReasons,
      recentExposureCount: profile.recentExposure.itemIds.length
    }
  };
}

/**
 * 清空 v2 画像：清空 UserPreference.metadata.profile，保留 metadata.tags（v1 标签表态）
 * 和行本身（interests 等不动）。清空后推荐回到无画像状态（验收要求）。
 */
export async function clearUserProfile(userId: string): Promise<{ ok: boolean; clearedAt: string }> {
  const clearedAt = new Date().toISOString();
  try {
    const existing = await prisma.userPreference.findUnique({ where: { userId } });
    if (!existing) {
      return { ok: true, clearedAt };
    }
    // 只移除 profile 子键，保留 tags 子键和其他数据。
    const root =
      existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const { profile: _, ...rest } = root;
    await prisma.userPreference.update({
      where: { userId },
      data: { metadata: toJson(rest) }
    });
    return { ok: true, clearedAt };
  } catch {
    return { ok: true, clearedAt };
  }
}
