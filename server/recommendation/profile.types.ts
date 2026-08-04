/**
 * 用户品味画像 MVP 类型定义。
 *
 * 设计原则(TASK-P2-002):
 * - 画像只增强排序,不改地点可执行性、城市信号匹配和交通重排原则。
 * - 不存精确浏览器坐标;area 仅保留区级粒度。
 * - 画像来源标签用于 explain 与降级判断(profile=命中画像 / fallback=回退即时聚合 / empty=无画像)。
 */

/** 画像维度。venue=地点级(item);其余维度从反馈 context 聚合。 */
export type ProfileDimension =
  | "venue"
  | "tag"
  | "source"
  | "area"
  | "priceLevel"
  | "quietnessBand"
  | "popularityBand";

/** 单个维度的权重组,键为该维度的值(如 tag="展览"、area="静安")。 */
export type DimensionWeights = Record<string, number>;

/** 完整画像快照,持久化到 UserPreference.metadata。 */
export type UserProfileSnapshot = {
  profileVersion: string;
  updatedAt: string;
  updatedFrom: number;
  decayWindowDays: number;
  positiveWeights: Record<ProfileDimension, DimensionWeights>;
  negativeWeights: Record<ProfileDimension, DimensionWeights>;
  recentExposure: RecentExposureEntry[];
  topReasons: string[];
};

export type RecentExposureEntry = {
  venueId: string;
  count: number;
  lastAt: string;
};

/** 候选命中画像的单个因子,用于 explain 与打分。 */
export type ProfileFactor = {
  dimension: ProfileDimension;
  key: string;
  weight: number;
};

/** 推荐响应 meta 中暴露的画像摘要。 */
export type UserProfileMeta = {
  version: string;
  source: "profile" | "fallback" | "empty";
  updatedFrom: number;
  updatedAt?: string;
  topPositive: ProfileFactor[];
  topNegative: ProfileFactor[];
  recentExposureHits: number;
};

/** 反馈/曝光信号条目,纯计算函数入参。 */
export type ProfileSignal = {
  action: "up" | "down" | "save" | "dismiss" | "impression";
  weight: number;
  createdAt: Date;
  itemId?: string;
  tags?: string[];
  source?: string;
  area?: string;
  priceLevel?: number;
  quietness?: number;
  popularity?: number;
  routeTitle?: string;
};

/** 曝光日志条目,从 RecommendationLog.recommendedRoutes 推导。 */
export type ExposureLogEntry = {
  venueIds: string[];
  createdAt: Date;
};

export const PROFILE_VERSION = "profile-v1";
export const PROFILE_DECAY_WINDOW_DAYS = 90;
export const PROFILE_RECOMPUTE_TTL_MS = 30 * 60 * 1000;
export const PROFILE_MIN_SIGNALS = 3;
export const PROFILE_RECENT_EXPOSURE_LIMIT = 30;
export const PROFILE_EXPOSURE_LOOKBACK_DAYS = 30;
export const PROFILE_MAX_EXPOSURE_LOGS = 50;

/** 单维度累计权重上限,避免单次反馈锁死排序。 */
export const PROFILE_WEIGHT_CAP = 12;

function emptyDimensionWeights(): DimensionWeights {
  return {};
}

/** 创建全维度为空的权重骨架。 */
export function createEmptyDimensionMap(): Record<ProfileDimension, DimensionWeights> {
  return {
    venue: emptyDimensionWeights(),
    tag: emptyDimensionWeights(),
    source: emptyDimensionWeights(),
    area: emptyDimensionWeights(),
    priceLevel: emptyDimensionWeights(),
    quietnessBand: emptyDimensionWeights(),
    popularityBand: emptyDimensionWeights()
  };
}

/** quietness 数值(0-100)分桶:安静/中性/热闹。 */
export function bucketQuietness(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value <= 33) return "quiet";
  if (value <= 66) return "neutral";
  return "lively";
}

/** popularity 数值(0-100)分桶:低/中/高人流。 */
export function bucketPopularity(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value <= 33) return "low";
  if (value <= 66) return "medium";
  return "high";
}

/** priceLevel 数值分桶:转字符串键。 */
export function bucketPriceLevel(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return String(Math.round(value));
}
