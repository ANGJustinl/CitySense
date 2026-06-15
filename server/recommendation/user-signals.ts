import { prisma } from "@/server/db/prisma";
import type { Candidate } from "@/server/recommendation/types";

export type UserRecommendationSignals = {
  itemWeights: Map<string, number>;
  tagWeights: Map<string, number>;
  sourceWeights: Map<string, number>;
  /** area 维度权重（TASK2-P0-004 激活，可选）。 */
  areaWeights?: Map<string, number>;
};

type InteractionContext = {
  tags?: unknown;
  source?: unknown;
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

function contextSource(context: unknown) {
  const value = context as InteractionContext | null;

  return typeof value?.source === "string" ? value.source : undefined;
}

export async function loadUserRecommendationSignals(
  userId: string | undefined
): Promise<UserRecommendationSignals> {
  const empty = {
    itemWeights: new Map<string, number>(),
    tagWeights: new Map<string, number>(),
    sourceWeights: new Map<string, number>()
  };

  if (!userId) {
    return empty;
  }

  try {
    const interactions = await prisma.userInteraction.findMany({
      where: {
        userId,
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
      const effectiveWeight = interaction.weight * decay(interaction.createdAt);

      addWeight(empty.itemWeights, interaction.itemId ?? undefined, effectiveWeight);
      addWeight(empty.sourceWeights, contextSource(interaction.context), effectiveWeight);

      for (const tag of contextTags(interaction.context)) {
        addWeight(empty.tagWeights, tag, effectiveWeight);
      }
    }
  } catch {
    return empty;
  }

  return empty;
}

export function calculateUserAffinity(candidate: Candidate, signals: UserRecommendationSignals) {
  const directWeight = signals.itemWeights.get(candidate.id) ?? 0;
  const sourceWeight = candidate.source ? (signals.sourceWeights.get(candidate.source) ?? 0) : 0;
  const tagWeight = candidate.tags.reduce((sum, tag) => sum + (signals.tagWeights.get(tag) ?? 0), 0);
  const total = directWeight * 16 + sourceWeight * 5 + tagWeight * 4;

  return Math.max(0, Math.min(100, Math.round(50 + total)));
}

export function calculateFeedbackPenalty(candidate: Candidate, signals: UserRecommendationSignals) {
  const directWeight = signals.itemWeights.get(candidate.id) ?? 0;
  const sourceWeight = candidate.source ? (signals.sourceWeights.get(candidate.source) ?? 0) : 0;
  const tagWeight = candidate.tags.reduce((sum, tag) => sum + Math.min(0, signals.tagWeights.get(tag) ?? 0), 0);
  const negative = Math.min(0, directWeight * 18 + sourceWeight * 4 + tagWeight * 4);

  return Math.max(0, Math.min(100, Math.round(Math.abs(negative))));
}
