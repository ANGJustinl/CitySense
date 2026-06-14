/**
 * 用户品味画像 MVP prisma 薄封装。
 *
 * 职责:从数据库读 interactions / recommendation logs,调用 user-profile-core 纯函数重算画像,
 * 把画像快照持久化到 UserPreference.metadata。
 *
 * 设计(TASK-P2-002):
 * - 读时懒重算 + TTL(30 分钟)失效:ranker 统一入口 ensureFreshProfile。
 * - 画像为空 / 读取失败 / 信号不足 → 返回 null,调用方(user-signals)回退即时聚合。
 * - clearProfile 物理删除 UserPreference 行,支持任务验收"用户可以清空画像"。
 * - 不实时爬虫/MCP;只读本地库表。
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  PROFILE_DECAY_WINDOW_DAYS,
  PROFILE_MAX_EXPOSURE_LOGS,
  PROFILE_MIN_SIGNALS,
  PROFILE_RECOMPUTE_TTL_MS,
  PROFILE_VERSION,
  type ProfileSignal,
  type UserProfileMeta,
  type UserProfileSnapshot
} from "@/server/recommendation/profile.types";
import {
  buildSnapshot,
  computeProfileWeights,
  computeRecentExposure,
  countExposureHits,
  topNegativeFactors,
  topPositiveFactors
} from "@/server/recommendation/user-profile-core";
import type { RecommendedRoute } from "@/server/recommendation/types";

const DAY_MS = 86_400_000;

/** 把对象转为 Prisma 接受的 InputJsonValue,沿用 feedback.ts 的处理方式。 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type InteractionRow = {
  weight: number;
  createdAt: Date;
  action: string;
  itemId: string | null;
  context: unknown;
};

function readTags(context: unknown): string[] | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const tags = (context as { tags?: unknown }).tags;

  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : undefined;
}

function readString(context: unknown, key: string): string | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const value = (context as Record<string, unknown>)[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(context: unknown, key: string): number | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const value = (context as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rowToSignal(row: InteractionRow): ProfileSignal {
  return {
    action: row.action as ProfileSignal["action"],
    weight: row.weight,
    createdAt: row.createdAt,
    itemId: row.itemId ?? undefined,
    tags: readTags(row.context),
    source: readString(row.context, "source"),
    area: readString(row.context, "area"),
    priceLevel: readNumber(row.context, "priceLevel"),
    quietness: readNumber(row.context, "quietness"),
    popularity: readNumber(row.context, "popularity")
  };
}

function readExposureVenueIds(routes: unknown): string[] {
  if (!Array.isArray(routes)) {
    return [];
  }

  const ids: string[] = [];

  for (const route of routes as RecommendedRoute[]) {
    if (!route || typeof route !== "object" || !Array.isArray(route.places)) {
      continue;
    }

    for (const place of route.places) {
      if (place && typeof place.id === "string") {
        ids.push(place.id);
      }
    }
  }

  return ids;
}

/** 解析 UserPreference.metadata 为画像快照;非法返回 null。 */
export function parseProfileSnapshot(metadata: unknown): UserProfileSnapshot | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = metadata as Partial<UserProfileSnapshot>;

  if (
    typeof candidate.profileVersion !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    !candidate.positiveWeights ||
    !candidate.negativeWeights
  ) {
    return null;
  }

  return candidate as UserProfileSnapshot;
}

/** 判断画像快照是否过期(TTL 或版本不符)。 */
export function isSnapshotStale(
  snapshot: UserProfileSnapshot | null,
  sinceInteractionAt?: Date | null,
  now: Date = new Date()
): boolean {
  if (!snapshot) {
    return true;
  }

  if (snapshot.profileVersion !== PROFILE_VERSION) {
    return true;
  }

  const ageMs = now.getTime() - new Date(snapshot.updatedAt).getTime();

  if (ageMs > PROFILE_RECOMPUTE_TTL_MS) {
    return true;
  }

  // 自上次重算后有新 interaction → 立即过期,确保反馈及时生效。
  if (sinceInteractionAt) {
    const updatedAtMs = new Date(snapshot.updatedAt).getTime();
    const interactionMs = sinceInteractionAt.getTime();

    if (interactionMs > updatedAtMs) {
      return true;
    }
  }

  return false;
}

/**
 * 读取已持久化的画像快照 + stale 标记。任何异常返回 null(降级)。
 */
export async function loadProfile(profileKey: string | undefined): Promise<{
  snapshot: UserProfileSnapshot | null;
  stale: boolean;
  latestInteractionAt: Date | null;
}> {
  if (!profileKey) {
    return { snapshot: null, stale: true, latestInteractionAt: null };
  }

  try {
    const [preference, latestInteraction] = await Promise.all([
      prisma.userPreference.findUnique({
        where: {
          userId: profileKey
        },
        select: {
          metadata: true,
          profileVersion: true,
          signalCount: true
        }
      }),
      prisma.userInteraction.findFirst({
        where: {
          userId: profileKey
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          createdAt: true
        }
      })
    ]);

    const snapshot = parseProfileSnapshot(preference?.metadata);
    const latestInteractionAt = latestInteraction?.createdAt ?? null;

    return {
      snapshot,
      stale: isSnapshotStale(snapshot, latestInteractionAt),
      latestInteractionAt
    };
  } catch {
    return { snapshot: null, stale: true, latestInteractionAt: null };
  }
}

/**
 * 重算并持久化画像快照。信号不足 / 写入失败 → 返回 null(调用方回退)。
 */
export async function recomputeProfile(profileKey: string): Promise<UserProfileSnapshot | null> {
  const now = new Date();
  const since = new Date(now.getTime() - PROFILE_DECAY_WINDOW_DAYS * DAY_MS);

  try {
    const [interactions, logs] = await Promise.all([
      prisma.userInteraction.findMany({
        where: {
          userId: profileKey,
          createdAt: {
            gte: since
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 500,
        select: {
          weight: true,
          createdAt: true,
          action: true,
          itemId: true,
          context: true
        }
      }),
      prisma.recommendationLog.findMany({
        where: {
          userId: profileKey,
          createdAt: {
            gte: new Date(now.getTime() - 30 * DAY_MS)
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: PROFILE_MAX_EXPOSURE_LOGS,
        select: {
          createdAt: true,
          recommendedRoutes: true
        }
      })
    ]);

    const signals = interactions.map(rowToSignal);
    const weights = computeProfileWeights(signals, { now });

    if (weights.skipped) {
      // 信号不足:清理旧画像(若有),让推荐回退通用逻辑。
      try {
        await prisma.userPreference.deleteMany({ where: { userId: profileKey } });
      } catch {
        // 删除失败不影响降级。
      }

      return null;
    }

    const exposureEntries = logs.map((log) => ({
      venueIds: readExposureVenueIds(log.recommendedRoutes),
      createdAt: log.createdAt
    }));
    const recentExposure = computeRecentExposure(exposureEntries, { now });
    const snapshot = buildSnapshot(weights, recentExposure, now);

    if (!snapshot) {
      return null;
    }

    await prisma.userPreference.upsert({
      where: {
        userId: profileKey
      },
      update: {
        metadata: toJson(snapshot),
        profileVersion: weights.signalCount,
        signalCount: weights.signalCount
      },
      create: {
        userId: profileKey,
        interests: [],
        metadata: toJson(snapshot),
        profileVersion: weights.signalCount,
        signalCount: weights.signalCount
      }
    });

    return snapshot;
  } catch {
    return null;
  }
}

/**
 * ranker / recommend 统一入口:确保返回新鲜画像(读 → 必要时重算 → 再读)。
 * 任何失败返回 null,调用方回退即时聚合。
 */
export async function ensureFreshProfile(profileKey: string | undefined): Promise<UserProfileSnapshot | null> {
  if (!profileKey) {
    return null;
  }

  const loaded = await loadProfile(profileKey);

  if (loaded.snapshot && !loaded.stale) {
    return loaded.snapshot;
  }

  const recomputed = await recomputeProfile(profileKey);

  if (recomputed) {
    return recomputed;
  }

  // 重算后仍无画像(信号不足):返回已加载的旧快照(若存在)作为 best-effort,否则 null。
  return loaded.snapshot;
}

/**
 * 物理删除画像,支持任务验收"用户可以清空画像;清空后推荐恢复无画像状态"。
 *
 * 画像由 UserInteraction 驱动聚合,只删 UserPreference 快照会导致下次推荐重算时
 * 从残留 interaction 重建画像。因此清空画像时同时删除该 profileKey 的
 * UserInteraction(画像数据源),保留 RecommendationFeedback(权威反馈事实表)
 * 和 RecommendationLog(推荐审计日志),它们不属于画像。
 */
export async function clearProfile(profileKey: string): Promise<boolean> {
  try {
    await prisma.$transaction([
      prisma.userPreference.deleteMany({ where: { userId: profileKey } }),
      prisma.userInteraction.deleteMany({ where: { userId: profileKey } })
    ]);
    return true;
  } catch {
    return false;
  }
}

/** 把画像快照转成推荐响应 meta 摘要。 */
export function buildProfileMeta(
  snapshot: UserProfileSnapshot | null,
  source: "profile" | "fallback" | "empty",
  candidateIds: string[] = []
): UserProfileMeta {
  if (!snapshot) {
    return {
      version: PROFILE_VERSION,
      source,
      updatedFrom: 0,
      topPositive: [],
      topNegative: [],
      recentExposureHits: 0
    };
  }

  return {
    version: snapshot.profileVersion,
    source,
    updatedFrom: snapshot.updatedFrom,
    updatedAt: snapshot.updatedAt,
    topPositive: topPositiveFactors(snapshot, 5),
    topNegative: topNegativeFactors(snapshot, 3),
    recentExposureHits: countExposureHits(candidateIds, snapshot)
  };
}

export const MIN_PROFILE_SIGNALS = PROFILE_MIN_SIGNALS;
