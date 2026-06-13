import type {
  RecommendedRoute,
  RecommendInput,
  SourceSignal,
  TrafficCandidate,
  TrafficInfo
} from "@/server/recommendation/types";
import { averageBreakdown, calculateFinalScore } from "@/server/recommendation/scoring";
import { distanceMeters } from "@/server/maps/traffic";

type RouteCandidateGroup = {
  candidates: TrafficCandidate[];
  routeScore: number;
};

function average(scores: number[]) {
  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function hasCoordinates(candidate: TrafficCandidate) {
  return Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng);
}

function routeDistancePenalty(candidates: TrafficCandidate[]) {
  const distances: number[] = [];

  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1];
    const current = candidates[index];

    if (!hasCoordinates(previous) || !hasCoordinates(current)) {
      distances.push(5000);
      continue;
    }

    distances.push(
      distanceMeters(
        { lat: previous.lat as number, lng: previous.lng as number },
        { lat: current.lat as number, lng: current.lng as number }
      )
    );
  }

  return average(distances);
}

function routeContinuityScore(candidates: TrafficCandidate[]) {
  const averageDistance = routeDistancePenalty(candidates);

  if (averageDistance <= 1200) return 96;
  if (averageDistance <= 2500) return 82;
  if (averageDistance <= 5000) return 62;
  if (averageDistance <= 9000) return 42;
  return 24;
}

function routeDiversityScore(candidates: TrafficCandidate[]) {
  const allTags = candidates.flatMap((candidate) => candidate.tags);
  const uniqueTags = new Set(allTags);
  const typeCount = new Set(candidates.map((candidate) => candidate.type)).size;
  const tagScore = allTags.length === 0 ? 50 : (uniqueTags.size / allTags.length) * 100;
  const typeBonus = typeCount > 1 ? 8 : 0;

  return Math.min(100, Math.round(tagScore + typeBonus));
}

function trafficEfficiencyScore(candidates: TrafficCandidate[]) {
  const duration = average(
    candidates.map((candidate) => candidate.traffic.estimatedDurationMinutes)
  );

  if (duration <= 15) return 95;
  if (duration <= 30) return 78;
  if (duration <= 45) return 58;
  return 36;
}

function groupKey(candidates: TrafficCandidate[]) {
  return candidates
    .map((candidate) => candidate.id)
    .sort()
    .join(":");
}

function scoreRouteGroup(candidates: TrafficCandidate[]) {
  const candidateScore = average(candidates.map((candidate) => candidate.adjustedScore));
  const continuity = routeContinuityScore(candidates);
  const diversity = routeDiversityScore(candidates);
  const trafficEfficiency = trafficEfficiencyScore(candidates);
  const timeFit = average(candidates.map((candidate) => candidate.scoreBreakdown.timeFit));

  return Math.round(
    candidateScore * 0.55 +
      continuity * 0.18 +
      diversity * 0.12 +
      trafficEfficiency * 0.1 +
      timeFit * 0.05
  );
}

function generateRouteGroups(candidates: TrafficCandidate[]) {
  const top = candidates.slice(0, 10);
  const groups: RouteCandidateGroup[] = [];

  for (let first = 0; first < top.length; first += 1) {
    for (let second = first + 1; second < top.length; second += 1) {
      const pair = [top[first], top[second]];
      groups.push({
        candidates: pair,
        routeScore: scoreRouteGroup(pair)
      });

      for (let third = second + 1; third < top.length; third += 1) {
        const triple = [top[first], top[second], top[third]];
        groups.push({
          candidates: triple,
          routeScore: scoreRouteGroup(triple)
        });
      }
    }
  }

  if (groups.length === 0) {
    return top.slice(0, 3).map((candidate) => ({
      candidates: [candidate],
      routeScore: candidate.adjustedScore
    }));
  }

  return groups.sort((a, b) => b.routeScore - a.routeScore);
}

function selectRouteGroups(candidates: TrafficCandidate[]) {
  const selected: RouteCandidateGroup[] = [];
  const usedKeys = new Set<string>();
  const firstPlaceIds = new Set<string>();
  const tagSignatures = new Set<string>();

  for (const group of generateRouteGroups(candidates)) {
    const key = groupKey(group.candidates);
    const firstPlaceId = group.candidates[0]?.id;
    const tagSignature = [...new Set(group.candidates.flatMap((candidate) => candidate.tags))]
      .slice(0, 3)
      .sort()
      .join(":");

    if (usedKeys.has(key)) {
      continue;
    }

    if (selected.length < 2 && firstPlaceId && firstPlaceIds.has(firstPlaceId)) {
      continue;
    }

    if (selected.length < 2 && tagSignature && tagSignatures.has(tagSignature)) {
      continue;
    }

    selected.push(group);
    usedKeys.add(key);

    if (firstPlaceId) {
      firstPlaceIds.add(firstPlaceId);
    }

    if (tagSignature) {
      tagSignatures.add(tagSignature);
    }

    if (selected.length === 3) {
      break;
    }
  }

  return selected.length > 0 ? selected : generateRouteGroups(candidates).slice(0, 3);
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
  const capturedAtValues = candidates
    .map((candidate) => candidate.traffic.capturedAt)
    .filter((capturedAt): capturedAt is string => Boolean(capturedAt));

  return {
    estimatedDurationMinutes: Math.max(1, Math.round(totalDuration * 0.75)),
    distanceMeters: totalDistance || undefined,
    mode: candidates[0]?.traffic.mode ?? "transit",
    congestion: candidates.some((candidate) => candidate.traffic.congestion === "busy")
      ? "busy"
      : candidates.some((candidate) => candidate.traffic.congestion === "moderate")
        ? "moderate"
        : "smooth",
    provider,
    cacheHit: candidates.length > 0 && candidates.every((candidate) => candidate.traffic.cacheHit),
    capturedAt: capturedAtValues.sort().at(-1)
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
  return selectRouteGroups(candidates)
    .filter((group) => group.candidates.length > 0)
    .map((group, index) => {
      const slice = group.candidates;
      const scoreBreakdown = averageBreakdown(slice.map((candidate) => candidate.scoreBreakdown));
      const totalScore = Math.round((calculateFinalScore(scoreBreakdown) + group.routeScore) / 2);
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
