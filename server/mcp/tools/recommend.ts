import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { recommend, recommendRequestSchema } from "@/server/recommendation/recommend";
import { jsonResult, requireDatabaseUrl, runTool } from "./shared";

/**
 * `recommend_routes`
 *
 * Generates 3 executable city exploration routes from CitySense's recommendation
 * pipeline: multi-channel recall -> weighted ranker -> AMap ETA rerank -> route
 * assembly -> LLM explanation. Mirrors `POST /api/recommend`.
 *
 * The input schema is a subset of `recommendRequestSchema`; defaults from the
 * zod schema (city=上海, interests=[咖啡,展览,书店], mood=solo, ...) apply when
 * the agent omits a field.
 */
const inputSchema = {
  city: z.string().describe("City name in Chinese, e.g. 上海 / 北京. Defaults to 上海."),
  area: z
    .string()
    .optional()
    .describe("District or neighborhood, e.g. 徐汇 / 静安. Optional."),
  interests: z
    .array(z.string())
    .optional()
    .describe(
      "User interests used for recall & taste scoring, e.g. ['咖啡','展览','书店']. Defaults to ['咖啡','展览','书店']."
    ),
  mood: z
    .enum(["quiet", "lively", "date", "solo", "random"])
    .optional()
    .describe("Mood influences taste scoring. quiet=低噪, lively=热闹, date=约会, solo=独处, random=随机."),
  budget: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Budget level. low/medium/high."),
  timeWindow: z
    .enum(["now", "tonight", "weekend"])
    .optional()
    .describe("When the user wants to go. now=现在, tonight=今晚, weekend=周末."),
  originAddress: z
    .string()
    .max(120)
    .optional()
    .describe(
      "Origin address text. Geocoded via AMap when provided; overrides `origin` if both given."
    ),
  origin: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string().optional()
    })
    .optional()
    .describe("Explicit origin coordinates for distance & ETA scoring."),
  useRealtimeTraffic: z
    .boolean()
    .optional()
    .describe(
      "Whether to call AMap for real-time ETA. Defaults to true; falls back to estimation if AMAP_API_KEY is unset."
    )
} satisfies Record<string, z.ZodType>;

export function registerRecommendTool(server: McpServer) {
  server.registerTool(
    "recommend_routes",
    {
      title: "Recommend city routes",
      description:
        "Generate 3 executable city exploration routes from CitySense. Each route has 2-3 places, traffic duration, source signals (e.g. 小红书热度, 高德POI), and an AI-explained reason. Writes a recommendation snapshot so route ids can be opened later via get_route_detail.",
      inputSchema,
      annotations: {
        readOnlyHint: false, // persists a RecommendationLog row
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (rawInput) => {
      const dbGuard = requireDatabaseUrl();
      if (dbGuard) {
        return dbGuard;
      }

      // `recommend()` already validates & defaults via recommendRequestSchema.
      return runTool(() => recommend(rawInput));
    }
  );
}

export { recommendRequestSchema };
