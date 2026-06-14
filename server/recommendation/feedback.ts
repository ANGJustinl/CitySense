import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { createRouteSnapshotId, parseRouteSnapshotId } from "@/server/routes/route-detail";
import { FEEDBACK_INTERACTION_WEIGHT } from "@/server/recommendation/feedback-weights";

// 站内反馈到 interaction 权重的映射：抽到 feedback-weights.ts 统一管理（TASK2-P0-004）。
const feedbackToInteractionWeight = FEEDBACK_INTERACTION_WEIGHT;

export const feedbackSchema = z.object({
  recommendationLogId: z.string().min(1).max(128),
  routeId: z.string().min(1).max(256),
  userId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  value: z.enum(["up", "down", "save", "dismiss"]),
  reason: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "reason can only contain letters, numbers, underscore, and dash")
    .optional()
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readRoutes(value: unknown): RecommendedRoute[] {
  return Array.isArray(value) ? (value as RecommendedRoute[]) : [];
}

function routeBelongsToLog(input: FeedbackInput, routes: RecommendedRoute[]) {
  const parsed = parseRouteSnapshotId(input.routeId);

  if (parsed && parsed.recommendationId !== input.recommendationLogId) {
    return null;
  }

  return (
    routes.find((route) => route.id === input.routeId) ??
    routes.find((route) => createRouteSnapshotId(input.recommendationLogId, route.id) === input.routeId) ??
    routes.find((route) => route.id.endsWith(`__${input.routeId}`)) ??
    null
  );
}

async function appendRecommendationFeedback(input: FeedbackInput) {
  try {
    const log = await prisma.recommendationLog.findUnique({
      where: {
        id: input.recommendationLogId
      }
    });

    if (!log) {
      return;
    }

    const existing = Array.isArray(log.feedback) ? log.feedback : [];
    await prisma.recommendationLog.update({
      where: {
        id: input.recommendationLogId
      },
      data: {
        feedback: toJson([
          ...existing,
          {
            routeId: input.routeId,
            value: input.value,
            reason: input.reason,
            userId: input.userId,
            sessionId: input.sessionId,
            createdAt: new Date().toISOString()
          }
        ])
      }
    });
  } catch {
    // recommendation_feedbacks is the authoritative table; log JSON is best-effort.
  }
}

async function writeInteractionMirror(input: FeedbackInput, route: RecommendedRoute) {
  const weight = feedbackToInteractionWeight[input.value];

  try {
    await prisma.userInteraction.createMany({
      data: route.places.map((place) => ({
        userId: input.userId ?? input.sessionId,
        recommendationId: input.recommendationLogId,
        routeId: input.routeId,
        itemId: place.id,
        itemType: place.type,
        action: input.value,
        weight,
        context: toJson({
          tags: place.tags,
          source: place.source,
          // TASK2-P0-004：携带 area，供 user-profile-v2 recompute 提取 area 维度偏好。
          area: place.area,
          reason: input.reason,
          routeTitle: route.title
        })
      }))
    });
  } catch {
    // The clean P0 feedback record has already been written; broad interaction mirroring is optional.
  }
}

export async function recordFeedback(rawInput: unknown) {
  const input = feedbackSchema.parse(rawInput);
  const log = await prisma.recommendationLog.findUnique({
    where: {
      id: input.recommendationLogId
    }
  });

  if (!log) {
    return {
      ok: false,
      status: 404,
      error: "Recommendation log not found"
    } as const;
  }

  const route = routeBelongsToLog(input, readRoutes(log.recommendedRoutes));

  if (!route) {
    return {
      ok: false,
      status: 400,
      error: "Route does not belong to recommendation log"
    } as const;
  }

  await prisma.recommendationFeedback.create({
    data: {
      recommendationLogId: input.recommendationLogId,
      routeId: input.routeId,
      userId: input.userId,
      sessionId: input.sessionId,
      value: input.value,
      reason: input.reason
    }
  });
  await appendRecommendationFeedback(input);
  await writeInteractionMirror(input, route);

  return {
    ok: true
  } as const;
}
