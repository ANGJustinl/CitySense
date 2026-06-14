import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { recordFeedback } from "@/server/recommendation/feedback";
import { requireDatabaseUrl, runTool } from "./shared";

/**
 * `record_feedback`
 *
 * Records a route-level feedback signal (up / down / save / dismiss). Mirrors
 * `POST /api/feedback`. Writes to `recommendation_feedbacks`, mirrors to
 * `user_interaction`, and best-effort backfills `RecommendationLog.feedback`.
 * Used to close the recommendation feedback loop.
 */
const inputSchema = {
  recommendationLogId: z
    .string()
    .min(1)
    .describe("The recommendationLog id (left half of a routeId, before the `__`)."),
  routeId: z
    .string()
    .min(1)
    .describe(
      "Route snapshot id of the form `${recommendationLogId}__${routeLocalId}`."
    ),
  value: z
    .enum(["up", "down", "save", "dismiss"])
    .describe("up=喜欢, down=不喜欢, save=收藏, dismiss=忽略."),
  reason: z
    .string()
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .describe("Optional short reason tag (letters/digits/_/- only, max 80 chars)."),
  userId: z.string().optional().describe("Optional user id."),
  sessionId: z.string().optional().describe("Optional session id.")
} satisfies Record<string, z.ZodType>;

export function registerFeedbackTool(server: McpServer) {
  server.registerTool(
    "record_feedback",
    {
      title: "Record route feedback",
      description:
        "Record a route-level feedback signal (up/down/save/dismiss). The recommendationLogId and routeId must refer to an existing recommendation snapshot (from recommend_routes). Used to close the recommendation feedback loop.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (rawInput) => {
      const dbGuard = requireDatabaseUrl();
      if (dbGuard) {
        return dbGuard;
      }

      // `recordFeedback()` validates via feedbackSchema and returns
      // { ok: true } on success, or { ok: false, status, error } on a
      // validation/lookup failure (which we surface as a normal result).
      return runTool(() => recordFeedback(rawInput));
    }
  );
}
