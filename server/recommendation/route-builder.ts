import type {
  RecommendedRoute,
  RecommendInput,
  SourceSignal,
  TrafficCandidate,
  TrafficInfo
} from "@/server/recommendation/types";
import { averageBreakdown, calculateFinalScore } from "@/server/recommendation/scoring";
import { distanceMeters } from "@/server/maps/traffic";
import { routeEligibilityFromQuality } from "@/server/recommendation/quality";

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

function normalizedAddress(candidate: TrafficCandidate) {
  return candidate.address?.replace(/\([^)]*\)|（[^）]*）/g, "").replace(/\s+/g, "").trim().toLowerCase();
}

function addressStreetNumber(address: string | undefined) {
  return address?.match(/[\u4e00-\u9fa5]+(?:路|街|道|弄)\d+号/)?.[0];
}

function normalizedName(candidate: TrafficCandidate) {
  return candidate.name.replace(/[^\p{Script=Han}a-z0-9]/giu, "").toLowerCase();
}

function commonPrefixLength(a: string, b: string) {
  let index = 0;

  while (index < a.length && index < b.length && a[index] === b[index]) {
    index += 1;
  }

  return index;
}

function samePlaceCluster(a: TrafficCandidate, b: TrafficCandidate) {
  const aAddress = normalizedAddress(a);
  const bAddress = normalizedAddress(b);

  if (aAddress && bAddress && aAddress === bAddress) {
    return true;
  }

  const aStreet = addressStreetNumber(aAddress);
  const bStreet = addressStreetNumber(bAddress);
  const aName = normalizedName(a);
  const bName = normalizedName(b);

  if (aStreet && bStreet && aStreet === bStreet && commonPrefixLength(aName, bName) >= 5) {
    return true;
  }

  return (
    aName.length >= 5 &&
    bName.length >= 5 &&
    (aName.includes(bName) || bName.includes(aName))
  );
}

function hasDuplicateAddress(candidates: TrafficCandidate[]) {
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (samePlaceCluster(candidates[first], candidates[second])) {
        return true;
      }
    }
  }

  return false;
}

function isRouteEligible(candidate: TrafficCandidate) {
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

const THEME_TAGS = {
  quietCulture: ["书店", "咖啡", "展览", "艺术", "文化", "安静", "漫画", "美术馆", "画廊"],
  nightlife: ["独立音乐", "夜生活", "livehouse", "Livehouse", "酒吧", "演出", "音乐"],
  marketFood: ["市集", "快闪", "美食", "餐饮", "汉堡节", "咖啡品鉴", "葡萄酒"]
};

const INTEREST_ALIASES: Record<string, string[]> = {
  市集: ["市集", "集市", "快闪", "嘉年华"],
  美食: ["美食", "餐饮", "小吃", "甜点", "糕饼", "烘焙", "汉堡", "咖啡品鉴", "葡萄酒"],
  咖啡: ["咖啡", "咖啡厅", "咖啡馆", "咖啡品鉴"],
  展览: ["展览", "展", "艺术", "美术馆", "画廊"],
  书店: ["书店", "图书", "独立出版"],
  独立音乐: ["独立音乐", "livehouse", "演出", "音乐"]
};

function normalizedTerm(value: string) {
  return value.trim().toLowerCase();
}

function textMatchesTerm(text: string, term: string) {
  const normalizedText = normalizedTerm(text);
  const normalized = normalizedTerm(term);

  return normalized.length > 0 && (normalizedText.includes(normalized) || normalized.includes(normalizedText));
}

function candidateSearchText(candidate: TrafficCandidate) {
  return [
    candidate.name,
    candidate.description,
    candidate.address,
    ...candidate.tags
  ]
    .filter(Boolean)
    .join(" ");
}

function aliasesForInterest(interest: string) {
  return [interest, ...(INTEREST_ALIASES[interest] ?? [])];
}

function candidateMatchesInterest(candidate: TrafficCandidate, interest: string) {
  const text = candidateSearchText(candidate);

  return aliasesForInterest(interest).some((term) => textMatchesTerm(text, term));
}

function requestCoverageScore(candidates: TrafficCandidate[], input: RecommendInput) {
  if (input.interests.length === 0) {
    return 62;
  }

  const covered = input.interests.filter((interest) =>
    candidates.some((candidate) => candidateMatchesInterest(candidate, interest))
  );

  return Math.round(45 + (covered.length / input.interests.length) * 55);
}

function tagMatchesTheme(tag: string, themeTag: string) {
  return textMatchesTerm(tag, themeTag);
}

function routeThemeCoherenceScore(candidates: TrafficCandidate[]) {
  const tags = candidates.flatMap((candidate) => candidate.tags);

  if (tags.length === 0) {
    return 50;
  }

  const scores = Object.values(THEME_TAGS).map((themeTags) =>
    tags.filter((tag) => themeTags.some((themeTag) => tagMatchesTheme(tag, themeTag))).length
  );
  const best = Math.max(...scores);
  const activeThemes = scores.filter((score) => score > 0).length;
  const coverage = best / Math.max(1, tags.length);
  const crossThemePenalty = Math.max(0, activeThemes - 1) * 10;

  return Math.max(20, Math.min(100, Math.round(55 + coverage * 60 - crossThemePenalty)));
}

function sourceEvidenceScore(candidates: TrafficCandidate[]) {
  const signals = candidates.flatMap((candidate) => candidate.sourceSignals);

  if (signals.length === 0) {
    return 45;
  }

  const strongest = Math.max(...signals.map((signal) => signal.score));
  const sourceBonus = Math.min(12, new Set(signals.map((signal) => signal.source)).size * 4);

  return Math.min(100, Math.round(strongest + sourceBonus));
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

function pointDistance(
  from: { lat: number; lng: number },
  candidate: TrafficCandidate
) {
  if (!hasCoordinates(candidate)) {
    return Number.POSITIVE_INFINITY;
  }

  return distanceMeters(from, {
    lat: candidate.lat as number,
    lng: candidate.lng as number
  });
}

function orderCandidatesForRoute(candidates: TrafficCandidate[], input: RecommendInput) {
  const remaining = [...candidates];
  const ordered: TrafficCandidate[] = [];
  let cursor =
    input.origin ??
    remaining
      .slice()
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .find(hasCoordinates);

  while (remaining.length > 0) {
    const next = cursor
      ? remaining
          .map((candidate) => ({
            candidate,
            distance: pointDistance(cursor as { lat: number; lng: number }, candidate)
          }))
          .sort((a, b) => a.distance - b.distance || b.candidate.adjustedScore - a.candidate.adjustedScore)[0]
          ?.candidate
      : remaining.sort((a, b) => b.adjustedScore - a.adjustedScore)[0];

    if (!next) {
      break;
    }

    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);

    if (hasCoordinates(next)) {
      cursor = {
        lat: next.lat as number,
        lng: next.lng as number
      };
    }
  }

  return ordered;
}

function groupKey(candidates: TrafficCandidate[]) {
  return candidates
    .map((candidate) => candidate.id)
    .sort()
    .join(":");
}

function scoreRouteGroup(candidates: TrafficCandidate[], input: RecommendInput) {
  const candidateScore = average(candidates.map((candidate) => candidate.adjustedScore));
  const continuity = routeContinuityScore(candidates);
  const diversity = routeDiversityScore(candidates);
  const themeCoherence = routeThemeCoherenceScore(candidates);
  const requestCoverage = requestCoverageScore(candidates, input);
  const sourceEvidence = sourceEvidenceScore(candidates);
  const trafficEfficiency = trafficEfficiencyScore(candidates);
  const timeFit = average(candidates.map((candidate) => candidate.scoreBreakdown.timeFit));

  return Math.round(
    candidateScore * 0.43 +
      continuity * 0.13 +
      themeCoherence * 0.14 +
      requestCoverage * 0.17 +
      sourceEvidence * 0.06 +
      trafficEfficiency * 0.05 +
      timeFit * 0.01 +
      diversity * 0.01
  );
}

function generateRouteGroups(candidates: TrafficCandidate[], input: RecommendInput) {
  const eligible = candidates.filter(isRouteEligible);
  const top = (eligible.length > 0 ? eligible : candidates).slice(0, 20);
  const groups: RouteCandidateGroup[] = [];
  const waypointCount = input.waypointCount ?? 3; // 默认 3 个途径点
  const preferPairsOnly = top.length < waypointCount;

  // 根据途径点数量生成组合
  function generateCombinations(startIndex: number, currentCombination: TrafficCandidate[], depth: number) {
    if (currentCombination.length === waypointCount) {
      const ordered = orderCandidatesForRoute([...currentCombination], input);
      groups.push({
        candidates: ordered,
        routeScore: scoreRouteGroup(ordered, input)
      });
      return;
    }

    // 如果剩余候选不足以填满组合，用较少的点生成
    if (startIndex >= top.length && currentCombination.length >= 2) {
      const ordered = orderCandidatesForRoute([...currentCombination], input);
      groups.push({
        candidates: ordered,
        routeScore: scoreRouteGroup(ordered, input)
      });
      return;
    }

    for (let i = startIndex; i < top.length; i++) {
      generateCombinations(i + 1, [...currentCombination, top[i]], depth + 1);
    }
  }

  // 如果候选点太少，至少生成所有可能的 2 点组合
  if (top.length < waypointCount) {
    for (let first = 0; first < top.length; first += 1) {
      for (let second = first + 1; second < top.length; second += 1) {
        const pair = orderCandidatesForRoute([top[first], top[second]], input);
        groups.push({
          candidates: pair,
          routeScore: scoreRouteGroup(pair, input)
        });

        if (top.length >= 3) {
          for (let third = second + 1; third < top.length; third += 1) {
            const triple = orderCandidatesForRoute([top[first], top[second], top[third]], input);
            groups.push({
              candidates: triple,
              routeScore: scoreRouteGroup(triple, input)
            });
          }
        }
      }
    }
  } else {
    // 生成指定数量的途径点组合
    generateCombinations(0, [], 0);
  }

  if (groups.length === 0) {
    return top.slice(0, 3).map((candidate) => ({
      candidates: [candidate],
      routeScore: candidate.adjustedScore
    }));
  }

  const nonDuplicateAddressGroups = groups.filter((group) => !hasDuplicateAddress(group.candidates));

  return (nonDuplicateAddressGroups.length > 0 ? nonDuplicateAddressGroups : groups).sort(
    (a, b) => b.routeScore - a.routeScore
  );
}

function selectRouteGroups(candidates: TrafficCandidate[], input: RecommendInput) {
  const selected: RouteCandidateGroup[] = [];
  const usedKeys = new Set<string>();
  const usedPlaceIds = new Set<string>();
  const usedCandidates: TrafficCandidate[] = [];
  const firstPlaceIds = new Set<string>();
  const tagSignatures = new Set<string>();
  const groups = generateRouteGroups(candidates, input);
  const preferredGroups = groups.filter((group) =>
    group.candidates.every((candidate) => Boolean(candidate.address) && isRouteEligible(candidate))
  );

  function addGroup(group: RouteCandidateGroup) {
    const key = groupKey(group.candidates);

    if (usedKeys.has(key)) {
      return false;
    }

    selected.push(group);
    usedKeys.add(key);
    for (const candidate of group.candidates) {
      usedPlaceIds.add(candidate.id);
      usedCandidates.push(candidate);
    }
    return true;
  }

  function reusesSelectedPlace(group: RouteCandidateGroup) {
    return group.candidates.some(
      (candidate) =>
        usedPlaceIds.has(candidate.id) ||
        usedCandidates.some((usedCandidate) => samePlaceCluster(candidate, usedCandidate))
    );
  }

  function markDiversity(group: RouteCandidateGroup) {
    const firstPlaceId = group.candidates[0]?.id;
    const tagSignature = [...new Set(group.candidates.flatMap((candidate) => candidate.tags))]
      .slice(0, 3)
      .sort()
      .join(":");

    if (firstPlaceId) {
      firstPlaceIds.add(firstPlaceId);
    }

    if (tagSignature) {
      tagSignatures.add(tagSignature);
    }
  }

  for (const group of preferredGroups) {
    const key = groupKey(group.candidates);
    const firstPlaceId = group.candidates[0]?.id;
    const tagSignature = [...new Set(group.candidates.flatMap((candidate) => candidate.tags))]
      .slice(0, 3)
      .sort()
      .join(":");

    if (usedKeys.has(key)) {
      continue;
    }

    if (reusesSelectedPlace(group)) {
      continue;
    }

    if (selected.length < 2 && firstPlaceId && firstPlaceIds.has(firstPlaceId)) {
      continue;
    }

    if (selected.length < 2 && tagSignature && tagSignatures.has(tagSignature)) {
      continue;
    }

    addGroup(group);
    markDiversity(group);

    if (selected.length === 3) {
      break;
    }
  }

  if (selected.length < 3) {
    for (const group of preferredGroups) {
      const firstPlaceId = group.candidates[0]?.id;

      if (reusesSelectedPlace(group)) {
        continue;
      }

      if (firstPlaceId && firstPlaceIds.has(firstPlaceId)) {
        continue;
      }

      if (addGroup(group)) {
        markDiversity(group);
      }

      if (selected.length === 3) {
        break;
      }
    }
  }

  if (selected.length < 3) {
    for (const group of preferredGroups) {
      if (reusesSelectedPlace(group)) {
        continue;
      }

      addGroup(group);

      if (selected.length === 3) {
        break;
      }
    }
  }

  if (selected.length < 3) {
    for (const group of groups) {
      if (reusesSelectedPlace(group)) {
        continue;
      }

      addGroup(group);

      if (selected.length === 3) {
        break;
      }
    }
  }

  return selected.length > 0 ? selected : groups.slice(0, 1);
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
  return selectRouteGroups(candidates, input)
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
        sourceUrl: candidate.sourceUrl,
        imageUrl: candidate.imageUrl
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
