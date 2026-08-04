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
  return candidate.address
    ?.replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[^\p{Script=Han}a-z0-9]/giu, "")
    .trim()
    .toLowerCase();
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
  const aVenueId = a.venueId ?? (a.type === "venue" ? a.id : undefined);
  const bVenueId = b.venueId ?? (b.type === "venue" ? b.id : undefined);

  if (aVenueId && bVenueId && aVenueId === bVenueId) {
    return true;
  }

  const aAddress = normalizedAddress(a);
  const bAddress = normalizedAddress(b);
  const aName = normalizedName(a);
  const bName = normalizedName(b);

  if (
    (aAddress && bName.length >= 5 && (aAddress.includes(bName) || bName.includes(aAddress))) ||
    (bAddress && aName.length >= 5 && (bAddress.includes(aName) || aName.includes(bAddress)))
  ) {
    return true;
  }

  if (aAddress && bAddress && aAddress === bAddress) {
    return true;
  }

  const aStreet = addressStreetNumber(aAddress);
  const bStreet = addressStreetNumber(bAddress);

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

  // TASK2-P0-004：candidateScore 权重 0.43→0.50。
  // 候选维度权重归一化后 adjustedScore 量纲下降（不再饱和在 100），route 组分中需相应
  // 提升 candidate 质量的主导地位，避免 continuity/theme 等组级特征过度影响最终排序。
  // 权重和保持 1.00：0.50+0.12+0.13+0.15+0.05+0.03+0.01+0.01。
  return Math.round(
    candidateScore * 0.5 +
      continuity * 0.12 +
      themeCoherence * 0.13 +
      requestCoverage * 0.15 +
      sourceEvidence * 0.05 +
      trafficEfficiency * 0.03 +
      timeFit * 0.01 +
      diversity * 0.01
  );
}

type GeneratedRouteGroups = {
  groups: RouteCandidateGroup[];
  // 实际生效的途径点个数。前端/MCP 可据此告知用户"因候选不足已从 6 点降级为 N 点"。
  // - 未指定 waypointCount（走 pairs/triples 路径）→ 沿用每条路线 2-3 点，记 null。
  // - 候选池连 2 个都凑不齐 → 退化为单点兜底，记 1。
  appliedWaypointCount: number | null;
};

// 组合数 C(n, k) 随 k 指数增长，需按途径点大小限制候选池规模避免爆炸。
// 索引即为 requestedSize（2-6）：2→20, 3→20, 4→12, 5→10, 6→8。
const POOL_LIMIT_BY_SIZE = [0, 0, 20, 20, 12, 10, 8];

function generateRouteGroups(candidates: TrafficCandidate[], input: RecommendInput): GeneratedRouteGroups {
  const eligible = candidates.filter(isRouteEligible);
  const allTop = (eligible.length > 0 ? eligible : candidates).slice(0, 20);
  const groups: RouteCandidateGroup[] = [];

  // 途径点数量（2-6）。未指定时保持原有行为：候选<9 只生成 pairs，否则 pairs+triples。
  const requestedSize = input.waypointCount && input.waypointCount >= 2 ? input.waypointCount : 0;

  if (requestedSize > 0) {
    // 指定了途径点数量：按大小生成组合。
    // 关键修复：候选池不足时做 clamping，而非静默退化为单点路线。
    // 例：用户要 6 点但候选池只有 4 个 → 生成 4 点路线组合，保留多地点诉求。
    const poolLimitBySize = POOL_LIMIT_BY_SIZE[requestedSize] ?? 8;
    const cappedPool = Math.min(allTop.length, poolLimitBySize);
    const effectiveSize = Math.min(requestedSize, cappedPool);

    // effectiveSize < 2：候选池连两点路线都凑不齐 → 走最后的单点兜底。
    if (effectiveSize < 2) {
      return {
        groups: allTop.slice(0, 3).map((candidate) => ({
          candidates: [candidate],
          routeScore: candidate.adjustedScore
        })),
        appliedWaypointCount: 1
      };
    }

    const top = allTop.slice(0, cappedPool);

    // 生成 C(top.length, effectiveSize) 的所有组合。
    // effectiveSize 已保证 <= top.length，故至少产出 1 个组合，不再落入单点兜底。
    const indices = Array.from({ length: effectiveSize }, (_, i) => i);
    const last = effectiveSize - 1;

    while (indices[0] <= top.length - effectiveSize) {
      const combo = indices.map((i) => top[i]);
      const ordered = orderCandidatesForRoute(combo, input);
      groups.push({
        candidates: ordered,
        routeScore: scoreRouteGroup(ordered, input)
      });

      // 组合递增：从最后一位开始进位。
      // 修复 off-by-one：原条件 `<= top.length - (effectiveSize - 1 - pos)` 会允许越界索引
      // （如 top.length=8、effectiveSize=6 时允许 indices[5]=8，而 top[8] 不存在）。
      // pos 位最大合法索引 = top.length - effectiveSize + pos（标准组合进位）。
      let pos = last;
      while (pos >= 0) {
        indices[pos] += 1;
        if (indices[pos] <= top.length - effectiveSize + pos) {
          // 重置后续位到最小合法值。
          for (let j = pos + 1; j < effectiveSize; j += 1) {
            indices[j] = indices[j - 1] + 1;
          }
          break;
        }
        pos -= 1;
      }

      if (pos < 0) {
        break;
      }
    }

    const nonDuplicateAddressGroups = groups.filter((group) => !hasDuplicateAddress(group.candidates));
    const sorted = (nonDuplicateAddressGroups.length > 0 ? nonDuplicateAddressGroups : groups).sort(
      (a, b) => b.routeScore - a.routeScore
    );

    return { groups: sorted, appliedWaypointCount: effectiveSize };
  }

  // 未指定途径点：原有行为（pairs + 可选 triples）。
  const preferPairsOnly = allTop.length < 9;

  for (let first = 0; first < allTop.length; first += 1) {
    for (let second = first + 1; second < allTop.length; second += 1) {
      const pair = orderCandidatesForRoute([allTop[first], allTop[second]], input);
      groups.push({
        candidates: pair,
        routeScore: scoreRouteGroup(pair, input)
      });

      if (preferPairsOnly) {
        continue;
      }

      for (let third = second + 1; third < allTop.length; third += 1) {
        const triple = orderCandidatesForRoute([allTop[first], allTop[second], allTop[third]], input);
        groups.push({
          candidates: triple,
          routeScore: scoreRouteGroup(triple, input)
        });
      }
    }
  }

  // pairs 路径仍可能因候选不足（<2）产出空组 → 单点兜底。
  if (groups.length === 0) {
    return {
      groups: allTop.slice(0, 3).map((candidate) => ({
        candidates: [candidate],
        routeScore: candidate.adjustedScore
      })),
      appliedWaypointCount: 1
    };
  }

  const nonDuplicateAddressGroups = groups.filter((group) => !hasDuplicateAddress(group.candidates));
  const sorted = (nonDuplicateAddressGroups.length > 0 ? nonDuplicateAddressGroups : groups).sort(
    (a, b) => b.routeScore - a.routeScore
  );

  return { groups: sorted, appliedWaypointCount: null };
}

type SelectedRouteGroups = {
  selected: RouteCandidateGroup[];
  appliedWaypointCount: number | null;
};

function selectRouteGroups(candidates: TrafficCandidate[], input: RecommendInput): SelectedRouteGroups {
  const selected: RouteCandidateGroup[] = [];
  const usedKeys = new Set<string>();
  const usedPlaceIds = new Set<string>();
  const usedCandidates: TrafficCandidate[] = [];
  const firstPlaceIds = new Set<string>();
  const tagSignatures = new Set<string>();
  const { groups, appliedWaypointCount } = generateRouteGroups(candidates, input);
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

  const finalSelected = selected.length > 0 ? selected : groups.slice(0, 1);

  return { selected: finalSelected, appliedWaypointCount };
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

export type BuiltRoutes = {
  routes: RecommendedRoute[];
  // 实际生效的途径点个数：null 表示未指定（沿用 pairs/triples 自适应），1 表示候选极度不足的单点兜底。
  appliedWaypointCount: number | null;
};

function mapGroupsToRoutes(selected: RouteCandidateGroup[], input: RecommendInput): RecommendedRoute[] {
  return selected
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
        area: candidate.area,
        lat: candidate.lat,
        lng: candidate.lng,
        tags: candidate.tags,
        priceLevel: candidate.priceLevel,
        quietness: candidate.quietness,
        popularity: candidate.popularity,
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

export function buildRoutes(
  candidates: TrafficCandidate[],
  input: RecommendInput
): RecommendedRoute[] {
  const { selected } = selectRouteGroups(candidates, input);
  return mapGroupsToRoutes(selected, input);
}

/**
 * 与 buildRoutes 相同，但同时返回实际生效的途径点个数。
 * recommend() 用它把 appliedWaypointCount 透出到 meta，
 * 让前端/MCP 能告知用户"因候选不足已从 6 点降级为 N 点"（诚实降级）。
 */
export function buildRoutesWithMeta(
  candidates: TrafficCandidate[],
  input: RecommendInput
): BuiltRoutes {
  const { selected, appliedWaypointCount } = selectRouteGroups(candidates, input);
  return {
    routes: mapGroupsToRoutes(selected, input),
    appliedWaypointCount
  };
}
