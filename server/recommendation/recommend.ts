import { z } from "zod";
import type { RecommendInput, RecommendResponse } from "@/server/recommendation/types";
import { collectSourceItems } from "@/server/sources/source-registry";
import { normalizeRawSourceItem } from "@/server/sources/crawler/normalizer";
import { scoreCandidate } from "@/server/recommendation/scoring";
import { enrichAndRerankByTraffic } from "@/server/recommendation/traffic-rerank";
import { buildRoutes } from "@/server/recommendation/route-builder";
import { explainRoutes } from "@/server/ai/explain-route";

export const recommendRequestSchema = z.object({
  userId: z.string().optional(),
  city: z.string().min(1).default("上海"),
  area: z.string().optional(),
  origin: z
    .object({
      lat: z.number(),
      lng: z.number()
    })
    .optional(),
  interests: z.array(z.string()).default(["咖啡", "展览", "书店"]),
  mood: z.enum(["quiet", "lively", "date", "solo", "random"]).default("solo"),
  budget: z.enum(["low", "medium", "high"]).default("medium"),
  timeWindow: z.enum(["now", "tonight", "weekend"]).default("tonight"),
  useRealtimeTraffic: z.boolean().default(true),
  useSocialSignals: z.boolean().default(true)
});

export async function recommend(rawInput: unknown): Promise<RecommendResponse> {
  const input: RecommendInput = recommendRequestSchema.parse(rawInput);
  const sourceItems = await collectSourceItems({
    city: input.city,
    area: input.area,
    keywords: input.interests.length > 0 ? input.interests : ["咖啡", "展览", "书店"],
    timeWindow: input.timeWindow
  });
  const candidates = sourceItems.map(normalizeRawSourceItem);
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, input))
    .sort((a, b) => b.baseScore - a.baseScore)
    .slice(0, 10);
  const trafficRanked = await enrichAndRerankByTraffic(scored, input);
  const routes = await explainRoutes(buildRoutes(trafficRanked, input), input);

  return {
    routes,
    meta: {
      candidateCount: candidates.length,
      trafficProvider: trafficRanked.some((candidate) => candidate.traffic.provider === "amap")
        ? "amap"
        : "estimated",
      generatedAt: new Date().toISOString()
    }
  };
}
