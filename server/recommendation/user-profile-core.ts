/**
 * 用户品味画像 MVP 纯计算函数。
 *
 * 设计说明(TASK-P2-002):
 * - 本文件不依赖 prisma / 任何运行时副作用,可被 node:test 直接覆盖。
 * - 时间衰减沿用 user-signals.ts 现有 4 档(1d/7d/30d/90d+),但负反馈 venue 维度用更短半衰期(7d 上限),
 *   对应任务风险"负权重要分散、地点级惩罚需更短半衰期"。
 * - 动作权重沿用 feedback.ts:7-12(up=1/down=-1.5/save=1.5/dismiss=-0.8);曝光 impression=0.3。
 */

import type { Candidate } from "@/server/recommendation/types";
import {
  PROFILE_DECAY_WINDOW_DAYS,
  PROFILE_EXPOSURE_LOOKBACK_DAYS,
  PROFILE_MIN_SIGNALS,
  PROFILE_RECENT_EXPOSURE_LIMIT,
  PROFILE_VERSION,
  PROFILE_WEIGHT_CAP,
  bucketPopularity,
  bucketPriceLevel,
  bucketQuietness,
  createEmptyDimensionMap,
  type DimensionWeights,
  type ExposureLogEntry,
  type ProfileDimension,
  type ProfileFactor,
  type ProfileSignal,
  type RecentExposureEntry,
  type UserProfileSnapshot
} from "@/server/recommendation/profile.types";

const DAY_MS = 86_400_000;

/**
 * 通用时间衰减,对应 user-signals.ts 的 4 档。
 * 正反馈 / 曝光用全档位;负反馈 venue 维度调用 decayNegativeVenue(更短半衰期)。
 */
export function decay(createdAt: Date, now: Date = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);

  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.72;
  if (ageDays <= 30) return 0.42;
  return 0.18;
}

/**
 * 负反馈 venue 维度的更短半衰期:7d 后衰减更快,30d 后基本失效。
 * 对应任务风险"地点级惩罚需更短半衰期",因为负反馈常表达"此路线组合不合适",未必是地点本身差。
 */
export function decayNegativeVenue(createdAt: Date, now: Date = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);

  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.5;
  if (ageDays <= 30) return 0.18;
  return 0.05;
}

function addWeight(map: DimensionWeights, key: string | undefined, weight: number) {
  if (!key) {
    return;
  }

  map[key] = (map[key] ?? 0) + weight;
}

/** 把单值 cap 到权重上限,避免单维度被锁死。 */
function capWeight(value: number) {
  if (value > PROFILE_WEIGHT_CAP) {
    return PROFILE_WEIGHT_CAP;
  }

  if (value < -PROFILE_WEIGHT_CAP) {
    return -PROFILE_WEIGHT_CAP;
  }

  return value;
}

/**
 * 信号是否在画像窗口内(默认 90 天)。
 */
function withinDecayWindow(signal: ProfileSignal, now: Date) {
  return now.getTime() - signal.createdAt.getTime() <= PROFILE_DECAY_WINDOW_DAYS * DAY_MS;
}

/**
 * 把单条信号展开成维度键列表,再按正负分桶累加。
 */
function accumulateSignal(
  signal: ProfileSignal,
  now: Date,
  positive: Record<ProfileDimension, DimensionWeights>,
  negative: Record<ProfileDimension, DimensionWeights>
) {
  const isNegative = signal.weight < 0;
  const targetMap = isNegative ? negative : positive;

  // venue 维度按 itemId 聚合;负反馈 venue 用更短半衰期。
  const venueDecay =
    isNegative && signal.itemId ? decayNegativeVenue(signal.createdAt, now) : decay(signal.createdAt, now);
  const effective = signal.weight * venueDecay;

  if (signal.itemId) {
    addWeight(isNegative ? negative.venue : positive.venue, signal.itemId, effective);
  }

  // 其他维度用全档位衰减。
  const dimensionDecay = decay(signal.createdAt, now);
  const dimensionEffective = signal.weight * dimensionDecay;

  if (signal.source) {
    addWeight(targetMap.source, signal.source, dimensionEffective);
  }

  if (signal.area) {
    addWeight(targetMap.area, signal.area, dimensionEffective);
  }

  const priceKey = bucketPriceLevel(signal.priceLevel);
  if (priceKey) {
    addWeight(targetMap.priceLevel, priceKey, dimensionEffective);
  }

  const quietKey = bucketQuietness(signal.quietness);
  if (quietKey) {
    addWeight(targetMap.quietnessBand, quietKey, dimensionEffective);
  }

  const popularityKey = bucketPopularity(signal.popularity);
  if (popularityKey) {
    addWeight(targetMap.popularityBand, popularityKey, dimensionEffective);
  }

  if (signal.tags) {
    for (const tag of signal.tags) {
      addWeight(targetMap.tag, tag, dimensionEffective);
    }
  }
}

function applyCaps(map: Record<ProfileDimension, DimensionWeights>) {
  for (const dimension of Object.keys(map) as ProfileDimension[]) {
    const bucket = map[dimension];

    for (const key of Object.keys(bucket)) {
      bucket[key] = Math.round(capWeight(bucket[key]) * 100) / 100;
    }
  }
}

export type ComputeWeightsOptions = {
  now?: Date;
  minSignals?: number;
};

export type ComputedWeights = {
  positiveWeights: Record<ProfileDimension, DimensionWeights>;
  negativeWeights: Record<ProfileDimension, DimensionWeights>;
  signalCount: number;
  skipped: boolean;
};

/**
 * 从扁平信号列表聚合正负权重。
 * 历史数据兼容:缺 area/priceLevel 等字段的信号只跳过对应维度,不抛错。
 * 最小样本阈值:信号 < minSignals(默认 3)时返回 skipped=true,避免稀疏过拟合。
 */
export function computeProfileWeights(
  signals: ProfileSignal[],
  options: ComputeWeightsOptions = {}
): ComputedWeights {
  const now = options.now ?? new Date();
  const minSignals = options.minSignals ?? PROFILE_MIN_SIGNALS;

  const positive = createEmptyDimensionMap();
  const negative = createEmptyDimensionMap();

  const recent = signals.filter((signal) => withinDecayWindow(signal, now));

  if (recent.length < minSignals) {
    return {
      positiveWeights: positive,
      negativeWeights: negative,
      signalCount: recent.length,
      skipped: true
    };
  }

  for (const signal of recent) {
    accumulateSignal(signal, now, positive, negative);
  }

  applyCaps(positive);
  applyCaps(negative);

  return {
    positiveWeights: positive,
    negativeWeights: negative,
    signalCount: recent.length,
    skipped: false
  };
}

/**
 * 从曝光日志统计每个 venueId 的曝光次数 + 最近曝光时间。
 * 只统计 lookbackDays(默认 30 天)内的曝光,保留最近 limit(默认 30)条。
 */
export function computeRecentExposure(
  logs: ExposureLogEntry[],
  options: ComputeWeightsOptions & { lookbackDays?: number; limit?: number } = {}
): RecentExposureEntry[] {
  const now = options.now ?? new Date();
  const lookbackDays = options.lookbackDays ?? PROFILE_EXPOSURE_LOOKBACK_DAYS;
  const limit = options.limit ?? PROFILE_RECENT_EXPOSURE_LIMIT;
  const cutoff = now.getTime() - lookbackDays * DAY_MS;

  const aggregate = new Map<string, { count: number; lastAtMs: number }>();

  for (const log of logs) {
    if (log.createdAt.getTime() < cutoff) {
      continue;
    }

    for (const venueId of log.venueIds) {
      const existing = aggregate.get(venueId) ?? { count: 0, lastAtMs: 0 };
      existing.count += 1;
      existing.lastAtMs = Math.max(existing.lastAtMs, log.createdAt.getTime());
      aggregate.set(venueId, existing);
    }
  }

  return Array.from(aggregate.entries())
    .map(([venueId, value]) => ({
      venueId,
      count: value.count,
      lastAt: new Date(value.lastAtMs).toISOString()
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

/**
 * 把候选的维度值映射成可命中的 (dimension, key) 列表。
 * 静默地丢弃候选没有的字段(如缺 area),不抛错。
 */
export function candidateDimensionKeys(candidate: Candidate): Array<{ dimension: ProfileDimension; key: string }> {
  const keys: Array<{ dimension: ProfileDimension; key: string }> = [];

  if (candidate.id) {
    keys.push({ dimension: "venue", key: candidate.id });
  }

  if (candidate.source) {
    keys.push({ dimension: "source", key: candidate.source });
  }

  if (candidate.area) {
    keys.push({ dimension: "area", key: candidate.area });
  }

  const priceKey = bucketPriceLevel(candidate.priceLevel);
  if (priceKey) {
    keys.push({ dimension: "priceLevel", key: priceKey });
  }

  const quietKey = bucketQuietness(candidate.quietness);
  if (quietKey) {
    keys.push({ dimension: "quietnessBand", key: quietKey });
  }

  const popularityKey = bucketPopularity(candidate.popularity);
  if (popularityKey) {
    keys.push({ dimension: "popularityBand", key: popularityKey });
  }

  for (const tag of candidate.tags) {
    keys.push({ dimension: "tag", key: tag });
  }

  return keys;
}

function lookupWeight(
  map: Record<ProfileDimension, DimensionWeights>,
  dimension: ProfileDimension,
  key: string
): number {
  return map[dimension]?.[key] ?? 0;
}

/**
 * 计算候选命中画像的因子列表。
 * 同时检查 positive/negative 两张表 + recentExposure(venue 命中)。
 * 无命中返回空数组。
 */
export function extractProfileFactors(
  candidate: Candidate,
  snapshot: UserProfileSnapshot | null
): ProfileFactor[] {
  if (!snapshot) {
    return [];
  }

  const factors: ProfileFactor[] = [];
  const keys = candidateDimensionKeys(candidate);

  for (const { dimension, key } of keys) {
    const positive = lookupWeight(snapshot.positiveWeights, dimension, key);

    if (positive > 0) {
      factors.push({ dimension, key, weight: positive });
    }

    const negative = lookupWeight(snapshot.negativeWeights, dimension, key);

    if (negative < 0) {
      factors.push({ dimension, key, weight: negative });
    }
  }

  // 新鲜度:venue 命中 recentExposure 视为负因子(看腻惩罚)。
  const exposure = snapshot.recentExposure.find((entry) => entry.venueId === candidate.id);

  if (exposure) {
    factors.push({
      dimension: "venue",
      key: candidate.id,
      weight: -Math.min(exposure.count, PROFILE_WEIGHT_CAP)
    });
  }

  return factors;
}

/** 取一张权重表里 top-N(按绝对值)的因子。 */
function topFactors(
  map: Record<ProfileDimension, DimensionWeights>,
  limit: number
): ProfileFactor[] {
  const factors: ProfileFactor[] = [];

  for (const dimension of Object.keys(map) as ProfileDimension[]) {
    const bucket = map[dimension];

    for (const key of Object.keys(bucket)) {
      const weight = bucket[key];

      if (weight !== 0) {
        factors.push({ dimension, key, weight });
      }
    }
  }

  return factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, limit);
}

/** 正因子 top-N(weight > 0)。 */
export function topPositiveFactors(
  weights: Pick<UserProfileSnapshot, "positiveWeights">,
  limit = 5
): ProfileFactor[] {
  return topFactors(weights.positiveWeights, limit).filter((factor) => factor.weight > 0);
}

/** 负因子 top-N(weight < 0)。 */
export function topNegativeFactors(
  weights: Pick<UserProfileSnapshot, "negativeWeights">,
  limit = 3
): ProfileFactor[] {
  return topFactors(weights.negativeWeights, limit).filter((factor) => factor.weight < 0);
}

const DIMENSION_LABELS: Record<ProfileDimension, string> = {
  venue: "venue",
  tag: "tag",
  source: "source",
  area: "area",
  priceLevel: "priceLevel",
  quietnessBand: "quietnessBand",
  popularityBand: "popularityBand"
};

function formatFactor(factor: ProfileFactor) {
  const sign = factor.weight >= 0 ? "+" : "";
  return `${DIMENSION_LABELS[factor.dimension]}:${factor.key} ${sign}${factor.weight}`;
}

/**
 * 把画像 top 因子格式化为人类可读字符串,如 `tag:展览 +8`、`venue:abc -6`。
 */
export function computeTopReasons(snapshot: UserProfileSnapshot, limit = 8): string[] {
  const positives = topPositiveFactors(snapshot, limit);
  const negatives = topNegativeFactors(snapshot, Math.floor(limit / 2));

  return [...positives, ...negatives]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, limit)
    .map(formatFactor);
}

/**
 * 组装完整画像快照(供 recomputeProfile 调用持久化)。
 * 若 weights.skipped(信号不足),返回 null——调用方据此不写快照。
 */
export function buildSnapshot(
  weights: ComputedWeights,
  recentExposure: RecentExposureEntry[],
  now: Date = new Date()
): UserProfileSnapshot | null {
  if (weights.skipped) {
    return null;
  }

  const snapshot: UserProfileSnapshot = {
    profileVersion: PROFILE_VERSION,
    updatedAt: now.toISOString(),
    updatedFrom: weights.signalCount,
    decayWindowDays: PROFILE_DECAY_WINDOW_DAYS,
    positiveWeights: weights.positiveWeights,
    negativeWeights: weights.negativeWeights,
    recentExposure,
    topReasons: []
  };

  snapshot.topReasons = computeTopReasons(snapshot);

  return snapshot;
}

/**
 * 统计候选在当前推荐批次中命中 recentExposure 的数量,用于 meta.recentExposureHits。
 */
export function countExposureHits(candidateIds: string[], snapshot: UserProfileSnapshot | null): number {
  if (!snapshot) {
    return 0;
  }

  const exposed = new Set(snapshot.recentExposure.map((entry) => entry.venueId));

  return candidateIds.filter((id) => exposed.has(id)).length;
}

export const userProfileCoreTesting = {
  decay,
  decayNegativeVenue,
  accumulateSignal,
  withinDecayWindow,
  capWeight
};
