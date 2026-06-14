import { prisma } from "@/server/db/prisma";
import type { Candidate } from "@/server/recommendation/types";
import { ensureFreshProfile } from "@/server/recommendation/user-profile";
import {
  candidateDimensionKeys,
  decayNegativeVenue
} from "@/server/recommendation/user-profile-core";
import type {
  ProfileDimension,
  UserProfileSnapshot
} from "@/server/recommendation/profile.types";

export type UserRecommendationSignals = {
  itemWeights: Map<string, number>;
  tagWeights: Map<string, number>;
  sourceWeights: Map<string, number>;
  /**
   * TASK-P2-002 扩展维度。来自画像快照或回退即时聚合。
   * 旧调用方只用 item/tag/source 三张 map 仍可工作。
   */
  areaWeights: Map<string, number>;
  priceWeights: Map<string, number>;
  quietnessWeights: Map<string, number>;
  popularityWeights: Map<string, number>;
  /** 画像快照(用于 explain)。null 表示无画像。 */
  snapshot: UserProfileSnapshot | null;
  /** 画像来源:profile=命中画像,fallback=回退即时聚合,empty=无画像。 */
  source: "profile" | "fallback" | "empty";
};

type InteractionContext = {
  tags?: unknown;
  source?: unknown;
  area?: unknown;
  priceLevel?: unknown;
  quietness?: unknown;
  popularity?: unknown;
};

function decay(createdAt: Date) {
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / 86_400_000);

  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.72;
  if (ageDays <= 30) return 0.42;
  return 0.18;
}

function addWeight(map: Map<string, number>, key: string | undefined, weight: number) {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + weight);
}

function contextTags(context: unknown) {
  const value = context as InteractionContext | null;

  if (!value || !Array.isArray(value.tags)) {
    return [];
  }

  return value.tags.filter((tag): tag is string => typeof tag === "string");
}

function contextString(context: unknown, key: keyof InteractionContext) {
  const value = context as InteractionContext | null;
  const raw = value?.[key];

  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function contextNumber(context: unknown, key: keyof InteractionContext) {
  const value = context as InteractionContext | null;
  const raw = value?.[key];

  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function bucketQuietness(value: number | undefined) {
  if (typeof value !== "number") return undefined;
  if (value <= 33) return "quiet";
  if (value <= 66) return "neutral";
  return "lively";
}

function bucketPopularity(value: number | undefined) {
  if (typeof value !== "number") return undefined;
  if (value <= 33) return "low";
  if (value <= 66) return "medium";
  return "high";
}

function emptySignals(): UserRecommendationSignals {
  return {
    itemWeights: new Map<string, number>(),
    tagWeights: new Map<string, number>(),
    sourceWeights: new Map<string, number>(),
    areaWeights: new Map<string, number>(),
    priceWeights: new Map<string, number>(),
    quietnessWeights: new Map<string, number>(),
    popularityWeights: new Map<string, number>(),
    snapshot: null,
    source: "empty"
  };
}

/**
 * 从画像快照重建可用的 weights map。
 * 把正负权重合并到同一张 map(正为正数,负为负数),供 calculateUserAffinity / Penalty 使用。
 */
function rebuildSignalsFromSnapshot(snapshot: UserProfileSnapshot): UserRecommendationSignals {
  const signals = emptySignals();
  signals.snapshot = snapshot;
  signals.source = "profile";

  const dimensions: Array<{
    dimension: ProfileDimension;
    target: Map<string, number>;
  }> = [
    { dimension: "venue", target: signals.itemWeights },
    { dimension: "tag", target: signals.tagWeights },
    { dimension: "source", target: signals.sourceWeights },
    { dimension: "area", target: signals.areaWeights },
    { dimension: "priceLevel", target: signals.priceWeights },
    { dimension: "quietnessBand", target: signals.quietnessWeights },
    { dimension: "popularityBand", target: signals.popularityWeights }
  ];

  for (const { dimension, target } of dimensions) {
    const positive = snapshot.positiveWeights[dimension] ?? {};
    const negative = snapshot.negativeWeights[dimension] ?? {};

    for (const [key, value] of Object.entries(positive)) {
      target.set(key, (target.get(key) ?? 0) + value);
    }
    for (const [key, value] of Object.entries(negative)) {
      target.set(key, (target.get(key) ?? 0) + value);
    }
  }

  return signals;
}

/**
 * 回退路径:从 UserInteraction 即时聚合(原 loadUserRecommendationSignals 实现)。
 * 修复了原实现的 dead-return bug:empty 在循环中被赋值但 return 的是未改动的同名变量。
 */
async function aggregateFromInteractions(profileKey: string): Promise<UserRecommendationSignals> {
  const signals = emptySignals();
  signals.source = "fallback";

  try {
    const interactions = await prisma.userInteraction.findMany({
      where: {
        userId: profileKey,
        createdAt: {
          gte: new Date(Date.now() - 90 * 86_400_000)
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 500
    });

    for (const interaction of interactions) {
      const isNegative = interaction.weight < 0;
      const venueDecay =
        isNegative && interaction.itemId
          ? decayNegativeVenue(interaction.createdAt)
          : decay(interaction.createdAt);
      const dimensionDecay = decay(interaction.createdAt);

      addWeight(signals.itemWeights, interaction.itemId ?? undefined, interaction.weight * venueDecay);
      addWeight(signals.sourceWeights, contextString(interaction.context, "source"), interaction.weight * dimensionDecay);
      addWeight(signals.areaWeights, contextString(interaction.context, "area"), interaction.weight * dimensionDecay);

      const price = contextNumber(interaction.context, "priceLevel");
      if (typeof price === "number") {
        addWeight(signals.priceWeights, String(Math.round(price)), interaction.weight * dimensionDecay);
      }

      addWeight(signals.quietnessWeights, bucketQuietness(contextNumber(interaction.context, "quietness")), interaction.weight * dimensionDecay);
      addWeight(signals.popularityWeights, bucketPopularity(contextNumber(interaction.context, "popularity")), interaction.weight * dimensionDecay);

      for (const tag of contextTags(interaction.context)) {
        addWeight(signals.tagWeights, tag, interaction.weight * dimensionDecay);
      }
    }
  } catch {
    // 降级到空信号。
    return emptySignals();
  }

  return signals;
}

/**
 * ranker 统一入口:profileKey = userId ?? sessionId。
 * 优先读画像快照(读时懒重算 + TTL);画像为空或读取失败 → 回退即时聚合。
 */
export async function loadUserRecommendationSignals(
  profileKey: string | undefined
): Promise<UserRecommendationSignals> {
  if (!profileKey) {
    return emptySignals();
  }

  try {
    const snapshot = await ensureFreshProfile(profileKey);

    if (snapshot) {
      return rebuildSignalsFromSnapshot(snapshot);
    }
  } catch {
    // 画像读取失败 → 回退即时聚合。
  }

  return aggregateFromInteractions(profileKey);
}

/**
 * 旧 API 兼容:candidateDimensionKeys 暴露给 scoring/features 计算 profileFactors 时用。
 */
export { candidateDimensionKeys };

export function calculateUserAffinity(candidate: Candidate, signals: UserRecommendationSignals) {
  const directWeight = signals.itemWeights.get(candidate.id) ?? 0;
  const sourceWeight = candidate.source ? (signals.sourceWeights.get(candidate.source) ?? 0) : 0;
  const tagWeight = candidate.tags.reduce((sum, tag) => sum + (signals.tagWeights.get(tag) ?? 0), 0);
  // TASK-P2-002 新维度:area/price/氛围,权重低于 tag/source,避免噪声压过城市信号。
  const areaWeight = candidate.area ? (signals.areaWeights.get(candidate.area) ?? 0) : 0;
  const priceWeight = String(Math.round(candidate.priceLevel));
  const priceSignal = signals.priceWeights.get(priceWeight) ?? 0;
  const quietKey = candidate.quietness <= 33 ? "quiet" : candidate.quietness <= 66 ? "neutral" : "lively";
  const quietnessSignal = signals.quietnessWeights.get(quietKey) ?? 0;
  const popKey = candidate.popularity <= 33 ? "low" : candidate.popularity <= 66 ? "medium" : "high";
  const popularitySignal = signals.popularityWeights.get(popKey) ?? 0;

  const total =
    directWeight * 16 +
    sourceWeight * 5 +
    tagWeight * 4 +
    areaWeight * 3 +
    priceSignal * 2 +
    quietnessSignal * 2 +
    popularitySignal * 1.5;

  return Math.max(0, Math.min(100, Math.round(50 + total)));
}

export function calculateFeedbackPenalty(candidate: Candidate, signals: UserRecommendationSignals) {
  const directWeight = signals.itemWeights.get(candidate.id) ?? 0;
  const sourceWeight = candidate.source ? (signals.sourceWeights.get(candidate.source) ?? 0) : 0;
  const tagWeight = candidate.tags.reduce((sum, tag) => sum + Math.min(0, signals.tagWeights.get(tag) ?? 0), 0);
  const areaWeight = candidate.area ? Math.min(0, signals.areaWeights.get(candidate.area) ?? 0) : 0;

  // 新鲜度:venue 命中 recentExposure → 叠加惩罚。
  const exposureEntry = signals.snapshot?.recentExposure.find((entry) => entry.venueId === candidate.id);
  const exposurePenalty = exposureEntry ? Math.min(exposureEntry.count, 6) : 0;

  const negative = Math.min(0, directWeight * 18 + sourceWeight * 4 + tagWeight * 4 + areaWeight * 3) - exposurePenalty;

  return Math.max(0, Math.min(100, Math.round(Math.abs(negative))));
}
