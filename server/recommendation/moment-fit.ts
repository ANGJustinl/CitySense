import type { CityConditionSummary } from "@/server/city-state/types";
import type {
  RecommendInput,
  RecommendedRoute,
  RouteEvidence,
  RouteMomentFit,
  TrafficCandidate
} from "@/server/recommendation/types";

const OUTDOOR_TAGS = /户外|公园|露营|市集|集市|街区|citywalk|江边|露天/i;

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseTime(value?: string) {
  if (!value) {
    return undefined;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
}

function conditionMap(conditions: CityConditionSummary[]) {
  return new Map(conditions.map((condition) => [condition.condition, condition]));
}

function conditionValue(conditions: CityConditionSummary[], key: CityConditionSummary["condition"]) {
  return conditionMap(conditions).get(key);
}

function hasOutdoorTags(tags: string[]) {
  return tags.some((tag) => OUTDOOR_TAGS.test(tag));
}

function candidateArrivalAt(candidate: TrafficCandidate, now: number) {
  return now + candidate.traffic.estimatedDurationMinutes * 60_000;
}

export function isMomentImpossibleCandidate(candidate: TrafficCandidate, now = Date.now()) {
  if (candidate.type !== "event") {
    return false;
  }

  const endsAt = parseTime(candidate.endsAt);

  if (!endsAt) {
    return false;
  }

  return endsAt <= now || candidateArrivalAt(candidate, now) > endsAt;
}

export function filterMomentImpossibleCandidates(
  candidates: TrafficCandidate[],
  now = Date.now()
) {
  return candidates.filter((candidate) => !isMomentImpossibleCandidate(candidate, now));
}

function conditionAdjustment(
  candidate: TrafficCandidate,
  input: RecommendInput,
  conditions: CityConditionSummary[]
) {
  const weather = conditionValue(conditions, "weather");
  const crowd = conditionValue(conditions, "crowd");
  const sentiment = conditionValue(conditions, "sentiment");
  const freshness = conditionValue(conditions, "freshness");
  let delta = 0;

  if (weather && !weather.metadata?.degraded) {
    if (weather.score < 45 && hasOutdoorTags(candidate.tags)) {
      delta -= 5;
    } else if (weather.score < 60 && hasOutdoorTags(candidate.tags)) {
      delta -= 3;
    } else if (weather.score >= 75) {
      delta += hasOutdoorTags(candidate.tags) ? 2 : 1;
    }
  }

  if (crowd) {
    if (input.mood === "quiet" || input.mood === "solo") {
      delta += crowd.score < 45 ? 3 : crowd.score >= 75 ? -4 : 0;
    } else if (input.mood === "lively") {
      delta += crowd.score >= 70 ? 3 : crowd.score < 35 ? -2 : 0;
    }
  }

  const sentimentLabel = String(sentiment?.metadata?.label ?? "");
  if (sentimentLabel === "calm" && (input.mood === "quiet" || input.mood === "solo")) {
    delta += 2;
  }
  if (sentimentLabel === "hyped" && input.mood === "lively") {
    delta += 2;
  }
  if (sentimentLabel === "noisy" && input.mood === "quiet") {
    delta -= 3;
  }

  if (freshness && freshness.score < 45) {
    delta -= 3;
  }

  return delta;
}

export function rerankCandidatesByMoment(
  candidates: TrafficCandidate[],
  input: RecommendInput,
  conditions: CityConditionSummary[],
  now = Date.now()
) {
  return filterMomentImpossibleCandidates(candidates, now)
    .map((candidate) => {
      const delta = conditionAdjustment(candidate, input, conditions);
      const adjustedScore = clamp(candidate.adjustedScore + delta);
      const scoreBreakdown = {
        ...candidate.scoreBreakdown,
        timeFit: clamp(candidate.scoreBreakdown.timeFit + delta)
      };

      return {
        ...candidate,
        adjustedScore,
        scoreBreakdown,
        features: {
          ...candidate.features,
          timeFit: scoreBreakdown.timeFit
        }
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

function routeArrivalFit(route: RecommendedRoute, now: number): RouteMomentFit["arrivalFit"] {
  const arrivalAt = now + route.traffic.estimatedDurationMinutes * 60_000;
  const eventPlaces = route.places.filter((place) => place.type === "event");

  if (eventPlaces.length === 0) {
    return "unknown";
  }

  for (const place of eventPlaces) {
    const endsAt = parseTime(place.endsAt);
    if (endsAt && (endsAt <= now || arrivalAt > endsAt)) {
      return "ended";
    }
  }

  for (const place of eventPlaces) {
    const startsAt = parseTime(place.startsAt);
    if (startsAt && arrivalAt > startsAt + 15 * 60_000) {
      return "tight";
    }
  }

  return "fits";
}

function routeUrgency(
  route: RecommendedRoute,
  input: RecommendInput,
  now: number
): RouteMomentFit["urgency"] {
  if (input.timeWindow === "now") {
    return "now";
  }

  const eventTimes = route.places.flatMap((place) => [
    parseTime(place.startsAt),
    parseTime(place.endsAt)
  ]).filter((time): time is number => typeof time === "number");

  if (eventTimes.some((time) => time > now && time - now <= 3 * 60 * 60_000)) {
    return "soon";
  }

  return eventTimes.length > 0 ? "flexible" : "unknown";
}

function weatherFit(weather?: CityConditionSummary): RouteMomentFit["weatherFit"] {
  if (!weather) return "unknown";
  if (weather.metadata?.degraded) return "unknown";
  if (weather.score >= 70) return "good";
  if (weather.score >= 45) return "ok";
  return "poor";
}

function weatherFactValue(weather: CityConditionSummary) {
  const phenomenon = typeof weather.metadata?.phenomenon === "string" ? weather.metadata.phenomenon : undefined;
  const temperature = typeof weather.metadata?.temperature === "string" ? weather.metadata.temperature : undefined;
  const detail = [phenomenon, temperature ? `${temperature}°` : undefined].filter(Boolean).join(" ");

  return detail ? `${weather.label}（${detail}）` : weather.label;
}

function crowdFit(crowd?: CityConditionSummary): RouteMomentFit["crowdFit"] {
  if (!crowd) return "unknown";
  if (crowd.score >= 72) return "busy";
  if (crowd.score <= 42) return "quiet";
  return "balanced";
}

function fitLabel(fit: RouteMomentFit["arrivalFit"]) {
  if (fit === "fits") return "时间可执行";
  if (fit === "tight") return "时间偏紧";
  if (fit === "ended") return "活动已结束";
  return "时间待确认";
}

function whyNow(input: {
  route: RecommendedRoute;
  arrivalFit: RouteMomentFit["arrivalFit"];
  weather?: CityConditionSummary;
  crowd?: CityConditionSummary;
  sentiment?: CityConditionSummary;
}) {
  const parts = [
    fitLabel(input.arrivalFit),
    input.weather ? `天气：${input.weather.label}` : "天气未缓存",
    input.crowd ? `人流：${input.crowd.label}` : "人流为估算空态",
    input.sentiment ? `城市情绪：${input.sentiment.label}` : undefined
  ].filter(Boolean);

  return `${input.route.places[0]?.name ?? "第一站"} 现在适合进入路线：${parts.join("；")}。`;
}

function sourceRole(source: string): RouteEvidence["signalRoles"][number]["role"] {
  if (source === "amap-poi") return "place_authority";
  if (source === "shanghai-gov" || source === "damai" || source === "douban") return "event_authority";
  if (source === "traffic") return "traffic_eta";
  if (source.startsWith("citysense-") || source.includes("weather")) return "condition_estimate";
  return "trend_evidence";
}

function placeEvidence(place: RecommendedRoute["places"][number]) {
  const facts = [
    place.address ? `地址：${place.address}` : undefined,
    Number.isFinite(place.lat) && Number.isFinite(place.lng) ? "坐标可用于路线规划" : undefined,
    place.startsAt ? `开始：${new Date(place.startsAt).toLocaleString("zh-CN", { hour12: false })}` : undefined,
    place.endsAt ? `结束：${new Date(place.endsAt).toLocaleString("zh-CN", { hour12: false })}` : undefined
  ].filter((fact): fact is string => Boolean(fact));
  const source = place.source ?? "database";
  const role = sourceRole(source);

  return {
    placeId: place.id,
    label:
      role === "place_authority"
        ? "地点已由高德 POI 支撑"
        : role === "event_authority"
          ? "活动来源可追溯"
          : "趋势线索已分离展示",
    source,
    confidence: role === "place_authority" ? 0.9 : role === "event_authority" ? 0.76 : 0.48,
    facts
  };
}

function buildEvidence(
  route: RecommendedRoute,
  conditions: CityConditionSummary[]
): RouteEvidence {
  const trafficCapturedAt = parseTime(route.traffic.capturedAt);
  const conditionFreshness = conditions.map((condition) => ({
    source: condition.source,
    label: condition.label,
    capturedAt: condition.capturedAt,
    ageMinutes: condition.ageMinutes
  }));
  const trafficFreshness = route.traffic.capturedAt
    ? [
        {
          source: route.traffic.provider,
          label: route.traffic.provider === "amap" ? "高德 ETA" : "估算 ETA",
          capturedAt: route.traffic.capturedAt,
          ageMinutes: trafficCapturedAt
            ? Math.max(0, Math.round((Date.now() - trafficCapturedAt) / 60_000))
            : undefined
        }
      ]
    : [];
  const routeSources = new Set([
    ...route.places.map((place) => place.source ?? "database"),
    ...route.sourceSignals.map((signal) => signal.source)
  ]);
  const signalRoles = [
    ...[...routeSources].map((source) => ({
      source,
      role: sourceRole(source),
      label:
        sourceRole(source) === "place_authority"
          ? "地点权威"
          : sourceRole(source) === "event_authority"
            ? "活动来源"
            : "趋势证据"
    })),
    {
      source: route.traffic.provider,
      role: "traffic_eta" as const,
      label: route.traffic.provider === "amap" ? "高德 ETA" : "估算 ETA"
    },
    ...conditions.map((condition) => ({
      source: condition.source,
      role: "condition_estimate" as const,
      label: condition.label
    }))
  ];
  const caveats = [
    routeSources.has("xiaohongshu") ? "小红书只作为趋势证据，不作为地点权威。" : undefined,
    route.traffic.provider === "estimated" ? "当前 ETA 为估算值，未命中高德实时路线。" : undefined,
    conditions.some((condition) => condition.expired) ? "存在过期城市状态，已降级展示。" : undefined,
    conditions.length === 0 ? "暂无城市状态快照，推荐未因此阻塞。" : undefined,
    conditions.some((condition) => condition.source === "citysense-crowd-estimator")
      ? "人流为 CitySense 估算，不等同真实客流。"
      : undefined
  ].filter((caveat): caveat is string => Boolean(caveat));

  return {
    placeChecks: route.places.map(placeEvidence),
    sourceFreshness: [...trafficFreshness, ...conditionFreshness],
    signalRoles,
    caveats
  };
}

export function attachMomentContextToRoutes(
  routes: RecommendedRoute[],
  input: RecommendInput,
  conditions: CityConditionSummary[],
  now = Date.now()
): RecommendedRoute[] {
  const weather = conditionValue(conditions, "weather");
  const crowd = conditionValue(conditions, "crowd");
  const sentiment = conditionValue(conditions, "sentiment");
  const freshness = conditionValue(conditions, "freshness");

  return routes.map((route) => {
    const arrivalFit = routeArrivalFit(route, now);
    const facts: RouteMomentFit["facts"] = [
      {
        label: "ETA",
        value: `${route.traffic.estimatedDurationMinutes} min`,
        source: route.traffic.provider
      }
    ];

    if (weather) {
      facts.push({
        label: "天气",
        value: weatherFactValue(weather),
        source: weather.source
      });
    }

    if (crowd) {
      facts.push({
        label: "人流",
        value: crowd.label,
        source: crowd.source
      });
    }

    if (sentiment) {
      facts.push({
        label: "情绪",
        value: sentiment.label,
        source: sentiment.source
      });
    }

    if (freshness) {
      facts.push({
        label: "新鲜度",
        value: freshness.label,
        source: freshness.source
      });
    }

    const momentFit: RouteMomentFit = {
      urgency: routeUrgency(route, input, now),
      arrivalFit,
      weatherFit: weatherFit(weather),
      crowdFit: crowdFit(crowd),
      whyNow: whyNow({
        route,
        arrivalFit,
        weather,
        crowd,
        sentiment
      }),
      facts
    };

    return {
      ...route,
      momentFit,
      evidence: buildEvidence(route, conditions)
    };
  });
}

export const __testing = {
  filterMomentImpossibleCandidates,
  isMomentImpossibleCandidate,
  rerankCandidatesByMoment,
  attachMomentContextToRoutes
};
