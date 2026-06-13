import { z } from "zod";
import type {
  RecallChannel,
  RecommendInput,
  RecommendResponse,
  ScoredCandidate
} from "@/server/recommendation/types";
import { retrieveDatabaseCandidates } from "@/server/recommendation/candidates";
import { enrichAndRerankByTraffic } from "@/server/recommendation/traffic-rerank";
import { buildRoutes } from "@/server/recommendation/route-builder";
import { buildSourceContextItems, explainRoutes } from "@/server/ai/explain-route";
import { persistRecommendationSnapshot } from "@/server/routes/route-detail";
import { rankCandidates } from "@/server/recommendation/ranker";
import { routeEligibilityFromQuality } from "@/server/recommendation/quality";

const TRAFFIC_ENRICHMENT_LIMIT = 20;

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

function isRouteEligibleForTraffic(candidate: ScoredCandidate) {
  return (
    candidate.routeEligible ??
    candidate.features.routeEligible ??
    routeEligibilityFromQuality({
      qualityScore: candidate.qualityScore ?? candidate.features.qualityScore,
      qualityFlags: candidate.qualityFlags ?? candidate.features.qualityFlags,
      address: candidate.address,
      lat: candidate.lat,
      lng: candidate.lng
    })
  );
}

export function selectTrafficCandidatesForEnrichment(
  ranked: ScoredCandidate[],
  limit = TRAFFIC_ENRICHMENT_LIMIT
) {
  const routeEligible = ranked.filter(isRouteEligibleForTraffic);
  const signalOnly = ranked.filter((candidate) => !isRouteEligibleForTraffic(candidate));

  return [...routeEligible, ...signalOnly].slice(0, limit);
}

export async function recommend(rawInput: unknown): Promise<RecommendResponse> {
  const input: RecommendInput = recommendRequestSchema.parse(rawInput);
  const candidates = await retrieveDatabaseCandidates(input);
  const rankerResult = await rankCandidates(input, candidates);
  const scored = selectTrafficCandidatesForEnrichment(rankerResult.ranked);
  const trafficRanked = await enrichAndRerankByTraffic(scored, input);
  const routes = await explainRoutes(buildRoutes(trafficRanked, input), input, {
    sourceContext: buildSourceContextItems(trafficRanked)
  });
  const snapshot = await persistRecommendationSnapshot(input, routes, trafficRanked);
  const recallChannels: RecallChannel[] = [
    ...new Set<RecallChannel>(
      candidates.flatMap((candidate) => candidate.recallChannels ?? ["base"])
    )
  ];

  return {
    routes: snapshot.routes,
    meta: {
      recommendationId: snapshot.recommendationId,
      candidateCount: candidates.length,
      trafficProvider: trafficRanked.some((candidate) => candidate.traffic.provider === "amap")
        ? "amap"
        : "estimated",
      ranker: rankerResult.ranker,
      rankerVersion: rankerResult.rankerVersion,
      recallChannels,
      generatedAt: new Date().toISOString()
    }
  };
}
