import type {
  RecommendedRoute,
  RecommendInput,
  SourceSignal,
  TrafficCandidate,
  TrafficInfo
} from "@/server/recommendation/types";
import { averageBreakdown, calculateFinalScore } from "@/server/recommendation/scoring";

function routeSlices(candidates: TrafficCandidate[]) {
  return [
    candidates.slice(0, 2),
    [candidates[1], candidates[3], candidates[4]].filter(Boolean),
    [candidates[2], candidates[5], candidates[0]].filter(Boolean)
  ];
}

function uniqueSignals(candidates: TrafficCandidate[]): SourceSignal[] {
  const seen = new Set<string>();
  return candidates
    .flatMap((candidate) => candidate.sourceSignals)
    .sort((a, b) => b.score - a.score)
    .filter((signal) => {
      const key = `${signal.source}-${signal.label}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function combineTraffic(candidates: TrafficCandidate[]): TrafficInfo {
  const totalDuration = candidates.reduce(
    (sum, candidate) => sum + candidate.traffic.estimatedDurationMinutes,
    0
  );
  const totalDistance = candidates.reduce(
    (sum, candidate) => sum + (candidate.traffic.distanceMeters ?? 0),
    0
  );
  const provider = candidates.some((candidate) => candidate.traffic.provider === "amap")
    ? "amap"
    : "estimated";

  return {
    estimatedDurationMinutes: Math.max(1, Math.round(totalDuration * 0.75)),
    distanceMeters: totalDistance || undefined,
    mode: candidates[0]?.traffic.mode ?? "transit",
    congestion: candidates.some((candidate) => candidate.traffic.congestion === "busy")
      ? "busy"
      : candidates.some((candidate) => candidate.traffic.congestion === "moderate")
        ? "moderate"
        : "smooth",
    provider
  };
}

function titleFor(index: number, input: RecommendInput) {
  const area = input.area ?? input.city;
  const names = [
    `${area} 即刻路线`,
    input.timeWindow === "weekend" ? `${input.city} 周末发散线` : `${area} 今晚延展线`,
    input.mood === "quiet" ? "低噪慢行线" : "热度探索线"
  ];

  return names[index] ?? `${input.city} 探索线`;
}

export function buildRoutes(
  candidates: TrafficCandidate[],
  input: RecommendInput
): RecommendedRoute[] {
  return routeSlices(candidates)
    .filter((slice) => slice.length > 0)
    .map((slice, index) => {
      const scoreBreakdown = averageBreakdown(slice.map((candidate) => candidate.scoreBreakdown));
      const totalScore = calculateFinalScore(scoreBreakdown);
      const traffic = combineTraffic(slice);
      const places = slice.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        address: candidate.address,
        lat: candidate.lat,
        lng: candidate.lng,
        tags: candidate.tags,
        source: candidate.source,
        sourceUrl: candidate.sourceUrl
      }));
      const tags = [...new Set(slice.flatMap((candidate) => candidate.tags))].slice(0, 4);

      return {
        id: `route-${index + 1}`,
        title: titleFor(index, input),
        summary: `${places.map((place) => place.name).join(" -> ")} / ${traffic.estimatedDurationMinutes} 分钟可达`,
        totalScore,
        scoreBreakdown,
        traffic,
        sourceSignals: uniqueSignals(slice),
        places,
        reason: `匹配 ${tags.join(" / ")}，并结合平台热度与当前可达性排序。`,
        tips: []
      };
    })
    .slice(0, 3);
}
