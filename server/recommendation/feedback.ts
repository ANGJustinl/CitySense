import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { createRouteSnapshotId, parseRouteSnapshotId } from "@/server/routes/route-detail";
import { FEEDBACK_INTERACTION_WEIGHT } from "@/server/recommendation/feedback-weights";
import { canonicalizeProfileArea, recomputeUserProfile } from "@/server/recommendation/user-profile-v2";

export const feedbackSchema = z.object({
  recommendationLogId: z.string().min(1).max(128),
  routeId: z.string().min(1).max(256),
  userId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  value: z.enum(["up", "down", "save", "dismiss"]),
  reason: z.string().trim().max(80).regex(/^[a-zA-Z0-9_-]+$/).optional()
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

type RecommendationInputContext = {
  userId?: string;
  sessionId?: string;
  mood?: string;
  budget?: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readRoutes(value: unknown): RecommendedRoute[] {
  return Array.isArray(value) ? (value as RecommendedRoute[]) : [];
}

function readRecommendationInput(value: unknown): RecommendationInputContext {
  return value && typeof value === "object" ? (value as RecommendationInputContext) : {};
}

function routeBelongsToLog(input: FeedbackInput, routes: RecommendedRoute[]) {
  const parsed = parseRouteSnapshotId(input.routeId);
  if (parsed && parsed.recommendationId !== input.recommendationLogId) return null;
  return (
    routes.find((route) => route.id === input.routeId) ??
    routes.find((route) => createRouteSnapshotId(input.recommendationLogId, route.id) === input.routeId) ??
    routes.find((route) => route.id.endsWith(`__${input.routeId}`)) ??
    null
  );
}

function resolveProfileKey(
  logUserId: string | null,
  logInput: RecommendationInputContext,
  input: FeedbackInput
) {
  const authoritative = logUserId ?? logInput.userId ?? logInput.sessionId;
  const claimed = input.userId ?? input.sessionId;
  if (authoritative && claimed && authoritative !== claimed) {
    return { error: "Feedback identity does not match recommendation log" } as const;
  }
  return { profileKey: authoritative ?? claimed } as const;
}

export async function recordFeedback(rawInput: unknown) {
  const input = feedbackSchema.parse(rawInput);
  const log = await prisma.recommendationLog.findUnique({
    where: { id: input.recommendationLogId }
  });
  if (!log) {
    return { ok: false, status: 404, error: "Recommendation log not found" } as const;
  }

  const route = routeBelongsToLog(input, readRoutes(log.recommendedRoutes));
  if (!route) {
    return { ok: false, status: 400, error: "Route does not belong to recommendation log" } as const;
  }

  const logInput = readRecommendationInput(log.input);
  const identity = resolveProfileKey(log.userId, logInput, input);
  if ("error" in identity) {
    return { ok: false, status: 409, error: identity.error } as const;
  }
  const profileKey = identity.profileKey;
  const now = new Date();

  const feedback = await prisma.$transaction(async (tx) => {
    const created = await tx.recommendationFeedback.create({
      data: {
        recommendationLogId: input.recommendationLogId,
        routeId: input.routeId,
        userId: input.userId ?? (profileKey && !profileKey.startsWith("anon-") ? profileKey : undefined),
        sessionId: input.sessionId ?? (profileKey?.startsWith("anon-") ? profileKey : undefined),
        value: input.value,
        reason: input.reason
      }
    });

    const existing = Array.isArray(log.feedback) ? log.feedback : [];
    await tx.recommendationLog.update({
      where: { id: input.recommendationLogId },
      data: {
        feedback: toJson([
          ...existing,
          {
            id: created.id,
            routeId: input.routeId,
            value: input.value,
            reason: input.reason,
            profileKey,
            createdAt: now.toISOString()
          }
        ])
      }
    });

    if (profileKey) {
      const weight = FEEDBACK_INTERACTION_WEIGHT[input.value];
      for (const place of route.places) {
        await tx.userInteraction.upsert({
          where: { signalKey: `feedback:${created.id}:item:${place.id}` },
          create: {
            userId: profileKey,
            recommendationId: input.recommendationLogId,
            routeId: input.routeId,
            itemId: place.id,
            itemType: place.type,
            action: input.value,
            weight,
            feedbackId: created.id,
            signalKey: `feedback:${created.id}:item:${place.id}`,
            signalKind: "route_feedback_item",
            context: toJson({
              tags: place.tags,
              source: place.source,
              area: canonicalizeProfileArea(place.area),
              priceLevel: place.priceLevel,
              quietness: place.quietness,
              popularity: place.popularity,
              mood: logInput.mood,
              budget: logInput.budget,
              reason: input.reason,
              routeTitle: route.title
            })
          },
          update: {}
        });
      }
    }
    return created;
  });

  let profileRefreshed = false;
  let profileSummary: { profileVersion: number; sampleSize: number; confidence: string; generatedAt: string } | undefined;
  if (profileKey) {
    const profile = await recomputeUserProfile(profileKey);
    profileRefreshed = profile.state !== "degraded";
    profileSummary = {
      profileVersion: profile.profileVersion,
      sampleSize: profile.sampleSize,
      confidence: profile.confidence,
      generatedAt: profile.generatedAt
    };
  }

  return {
    ok: true,
    feedbackSaved: true,
    feedbackId: feedback.id,
    profileKey: profileKey ?? null,
    effectiveValue: input.value,
    profileRefreshed,
    profile: profileSummary ?? null
  } as const;
}
