import { z } from "zod";
import type {
  OriginSource,
  RecallChannel,
  RecommendInput,
  RecommendResponse,
  ScoredCandidate
} from "@/server/recommendation/types";
import { retrieveDatabaseCandidates } from "@/server/recommendation/candidates";
import { enrichAndRerankByTraffic } from "@/server/recommendation/traffic-rerank";
import { buildRoutes } from "@/server/recommendation/route-builder";
import { planRoutesLegs } from "@/server/maps/route-legs";
import { buildSourceContextItems, explainRoutes } from "@/server/ai/explain-route";
import { persistRecommendationSnapshot } from "@/server/routes/route-detail";
import { rankCandidates } from "@/server/recommendation/ranker";
import { routeEligibilityFromQuality } from "@/server/recommendation/quality";
import { geocodeAddress, type GeocodeResult } from "@/server/maps/geocode";

const TRAFFIC_ENRICHMENT_LIMIT = 20;
const ORIGIN_ADDRESS_MAX_LENGTH = 120;

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(maxLength).optional()
  );

export const recommendRequestSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().max(128).optional(),
  city: z.string().min(1).default("上海"),
  area: optionalTrimmedString(60),
  originAddress: optionalTrimmedString(ORIGIN_ADDRESS_MAX_LENGTH),
  origin: z
    .object({
      lat: z.number().finite(),
      lng: z.number().finite(),
      label: optionalTrimmedString(60),
      address: optionalTrimmedString(ORIGIN_ADDRESS_MAX_LENGTH),
      source: z.enum(["browser", "manual", "default"]).optional(),
      provider: z.enum(["amap", "browser", "default"]).optional()
    })
    .optional(),
  interests: z.array(z.string()).default(["咖啡", "展览", "书店"]),
  mood: z.enum(["quiet", "lively", "date", "solo", "random"]).default("solo"),
  budget: z.enum(["low", "medium", "high"]).default("medium"),
  timeWindow: z.enum(["now", "tonight", "weekend"]).default("tonight"),
  useRealtimeTraffic: z.boolean().default(true),
  useSocialSignals: z.boolean().default(true),
  // 匿名用户冷启动多样性补偿（TASK2-P0-004）：前端可传入上次推荐的 placeId/title。
  recentExposure: z
    .object({
      itemIds: z.array(z.string().max(128)).max(200).optional(),
      routeTitles: z.array(z.string().max(120)).max(50).optional()
    })
    .optional()
});

type GeocodeAddress = typeof geocodeAddress;

function originLabelFor(input: RecommendInput, geocoded?: GeocodeResult | null) {
  return (
    input.originAddress ??
    input.origin?.label ??
    input.origin?.address ??
    geocoded?.address ??
    "出发点"
  );
}

function originSourceFor(input: RecommendInput): OriginSource {
  if (input.originAddress) {
    return "manual";
  }

  return input.origin?.source ?? "default";
}

function originProviderFor(input: RecommendInput): "amap" | "browser" | "default" {
  if (input.origin?.provider) {
    return input.origin.provider;
  }

  return input.origin?.source === "browser" ? "browser" : "default";
}

export async function resolveRecommendationOrigin(
  input: RecommendInput,
  geocode: GeocodeAddress = geocodeAddress
): Promise<RecommendInput> {
  if (!input.originAddress) {
    if (!input.origin) {
      return input;
    }

    return {
      ...input,
      origin: {
        ...input.origin,
        label: input.origin.label ?? input.origin.address ?? "出发点",
        source: input.origin.source ?? "default",
        provider: originProviderFor(input)
      }
    };
  }

  const geocoded = await geocode(input.originAddress, input.city);

  if (geocoded) {
    return {
      ...input,
      origin: {
        lat: geocoded.lat,
        lng: geocoded.lng,
        label: originLabelFor(input, geocoded),
        address: geocoded.address,
        source: "manual",
        provider: geocoded.provider === "amap" ? "amap" : "default"
      }
    };
  }

  if (!input.origin) {
    return input;
  }

  return {
    ...input,
    origin: {
      ...input.origin,
      label: originLabelFor(input),
      address: input.origin.address ?? input.originAddress,
      source: originSourceFor(input),
      provider: originProviderFor(input)
    }
  };
}

function responseOrigin(input: RecommendInput): RecommendResponse["meta"]["origin"] {
  if (!input.origin) {
    return input.originAddress
      ? {
          label: input.originAddress,
          address: input.originAddress,
          source: "manual",
          status: "unresolved"
        }
      : undefined;
  }

  return {
    lat: input.origin.lat,
    lng: input.origin.lng,
    label: input.origin.label,
    address: input.origin.address,
    source: input.origin.source,
    provider: input.origin.provider,
    status: "resolved"
  };
}

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
  const input = await resolveRecommendationOrigin(recommendRequestSchema.parse(rawInput));
  const candidates = await retrieveDatabaseCandidates(input);
  const rankerResult = await rankCandidates(input, candidates);
  const scored = selectTrafficCandidatesForEnrichment(rankerResult.ranked);
  const trafficRanked = await enrichAndRerankByTraffic(scored, input);
  const composedRoutes = await planRoutesLegs(buildRoutes(trafficRanked, input), {
    city: input.city,
    origin: input.origin,
    originName: input.origin?.label ?? input.origin?.address,
    useRealtimeTraffic: input.useRealtimeTraffic
  });
  const routes = await explainRoutes(composedRoutes, input, {
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
      origin: responseOrigin(input),
      ranker: rankerResult.ranker,
      rankerVersion: rankerResult.rankerVersion,
      recallChannels,
      profileApplied: rankerResult.profileApplied,
      generatedAt: new Date().toISOString()
    }
  };
}
