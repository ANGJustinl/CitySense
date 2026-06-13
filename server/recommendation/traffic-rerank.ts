import type {
  RecommendInput,
  ScoredCandidate,
  TrafficCandidate,
  TravelMode
} from "@/server/recommendation/types";
import { calculateFinalScore } from "@/server/recommendation/scoring";
import { getTrafficReachabilityScore, resolveTrafficInfo } from "@/server/maps/traffic";

function travelModeFor(input: RecommendInput): TravelMode {
  if (input.timeWindow === "now" && input.area) {
    return "walking";
  }

  if (input.mood === "date") {
    return "driving";
  }

  return "transit";
}

export async function enrichAndRerankByTraffic(
  candidates: ScoredCandidate[],
  input: RecommendInput
): Promise<TrafficCandidate[]> {
  const mode = travelModeFor(input);
  const enriched = await Promise.all(
    candidates.map(async (candidate) => {
      const traffic = await resolveTrafficInfo({
        city: input.city,
        origin: input.origin,
        destination:
          candidate.lat && candidate.lng
            ? {
                lat: candidate.lat,
                lng: candidate.lng
              }
            : undefined,
        mode,
        useRealtimeTraffic: input.useRealtimeTraffic
      });
      const trafficScore = getTrafficReachabilityScore(
        traffic.estimatedDurationMinutes,
        traffic.mode
      );
      const scoreBreakdown = {
        ...candidate.scoreBreakdown,
        traffic: trafficScore
      };

      return {
        ...candidate,
        traffic,
        scoreBreakdown,
        adjustedScore: calculateFinalScore(scoreBreakdown)
      };
    })
  );

  return enriched.sort((a, b) => b.adjustedScore - a.adjustedScore);
}
