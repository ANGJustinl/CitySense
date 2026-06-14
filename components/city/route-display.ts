import type {
  RecommendedRoute,
  RouteLeg,
  SourceSignal,
  TravelMode
} from "@/server/recommendation/types";

const modeLabel: Record<TravelMode, string> = {
  walking: "步行",
  transit: "公交",
  driving: "驾车"
};

export type RouteChoiceSummary = {
  durationLabel: string;
  stopCountLabel: string;
  scoreLabel: string;
  endpointLabel: string;
  signalLabel: string;
  providerLabel: string;
};

export type RouteThemeKey =
  | "nightlife"
  | "quiet-culture"
  | "cafe-food"
  | "heat"
  | "city";

export type RoutePersona = {
  themeKey: RouteThemeKey;
  themeName: string;
  tags: string[];
  representativePlace: {
    id: string;
    name: string;
    imageUrl?: string;
  };
  topSignal?: SourceSignal;
  featureText: string;
};

export type RouteJourneyItem =
  | {
      type: "origin";
      id: string;
      label: string;
      title: string;
    }
  | {
      type: "stop";
      id: string;
      label: string;
      title: string;
      address: string;
      legLabel?: string;
      tags: string[];
    };

export function formatDistance(distanceMeters?: number) {
  if (!distanceMeters || distanceMeters <= 0) {
    return undefined;
  }

  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${Math.round(distanceMeters)} m`;
}

export function formatRouteLegLabel(leg?: RouteLeg) {
  if (!leg) {
    return undefined;
  }

  const prefix = leg.provider === "estimated" ? "约 " : "";
  const line = leg.transitLines?.[0];
  const distance = formatDistance(leg.distanceMeters);
  const parts = [
    `${prefix}${leg.durationMinutes} min`,
    line ?? modeLabel[leg.mode],
    distance
  ].filter(Boolean);

  return parts.join(" · ");
}

export function buildRouteChoiceSummary(route: RecommendedRoute): RouteChoiceSummary {
  const first = route.places[0]?.name;
  const last = route.places.at(-1)?.name;
  const endpointLabel =
    first && last && first !== last
      ? `${first} -> ${last}`
      : first ?? "路线地点待确认";

  return {
    durationLabel: `${route.traffic.estimatedDurationMinutes} min`,
    stopCountLabel: `${route.places.length} 站`,
    scoreLabel: `${route.totalScore}`,
    endpointLabel,
    signalLabel: `${route.sourceSignals.length} 信号`,
    providerLabel: route.traffic.provider === "amap" ? "高德 ETA" : "估算 ETA"
  };
}

const themeConfigs: {
  key: RouteThemeKey;
  name: string;
  terms: string[];
}[] = [
  {
    key: "nightlife",
    name: "夜生活能量线",
    terms: ["夜生活", "独立音乐", "livehouse", "酒吧", "演出", "音乐", "娱乐场所"]
  },
  {
    key: "quiet-culture",
    name: "安静文化线",
    terms: ["书店", "展览", "艺术", "文化", "安静", "漫画", "美术馆", "画廊"]
  },
  {
    key: "cafe-food",
    name: "咖啡美食线",
    terms: ["咖啡", "咖啡厅", "咖啡馆", "餐饮", "美食", "糕饼", "烘焙", "甜品"]
  },
  {
    key: "heat",
    name: "热度探索线",
    terms: ["市集", "快闪", "热门", "热度", "潮流", "活动", "体育休闲", "购物"]
  },
  {
    key: "city",
    name: "城市探索线",
    terms: []
  }
];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function textMatchesTerm(text: string, term: string) {
  const source = normalized(text);
  const target = normalized(term);

  return source.includes(target) || target.includes(source);
}

function themeScore(route: RecommendedRoute, terms: string[]) {
  const searchable = [
    route.title,
    route.summary,
    route.reason,
    ...route.places.flatMap((place) => [place.name, place.address, ...place.tags]),
    ...route.sourceSignals.flatMap((signal) => [signal.label, signal.evidence])
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");

  return terms.reduce(
    (score, term) => score + (textMatchesTerm(searchable, term) ? 1 : 0),
    0
  );
}

function selectTheme(route: RecommendedRoute) {
  const scored = themeConfigs
    .filter((theme) => theme.key !== "city")
    .map((theme) => ({
      theme,
      score: themeScore(route, theme.terms)
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best && best.score > 0) {
    return best.theme;
  }

  return themeConfigs.find((theme) => theme.key === "city") ?? themeConfigs.at(-1)!;
}

function representativeTags(route: RecommendedRoute, themeTerms: string[]) {
  const tags = route.places.flatMap((place) => place.tags);
  const uniqueTags = [...new Set(tags)];
  const themed = uniqueTags.filter((tag) =>
    themeTerms.some((term) => textMatchesTerm(tag, term))
  );

  return [...themed, ...uniqueTags.filter((tag) => !themed.includes(tag))].slice(0, 3);
}

function signalFor(route: RecommendedRoute) {
  return route.sourceSignals.slice().sort((a, b) => b.score - a.score)[0];
}

function representativePlaceFor(route: RecommendedRoute, themeTags: string[]) {
  const imagePlace = route.places.find((place) => Boolean(place.imageUrl));
  const themedPlace = route.places.find((place) =>
    place.tags.some((tag) => themeTags.some((themeTag) => textMatchesTerm(tag, themeTag)))
  );
  const firstPlace = route.places[0];
  const selected = imagePlace ?? themedPlace ?? firstPlace;

  return {
    id: selected?.id ?? route.id,
    name: selected?.name ?? "路线地点待确认",
    imageUrl: selected?.imageUrl
  };
}

export function buildRoutePersona(route: RecommendedRoute): RoutePersona {
  const theme = selectTheme(route);
  const tags = representativeTags(route, theme.terms);
  const representativePlace = representativePlaceFor(route, tags);
  const topSignal = signalFor(route);
  const tagText = tags.length > 0 ? tags.join(" / ") : "城市探索";
  const signalText = topSignal
    ? `${topSignal.label} ${topSignal.score}`
    : "暂无来源信号";

  return {
    themeKey: theme.key,
    themeName: theme.name,
    tags,
    representativePlace,
    topSignal,
    featureText: `${representativePlace.name} 领衔，串起 ${tagText}；${signalText}。`
  };
}

function legForPlace(route: RecommendedRoute, placeId: string, index: number) {
  const legs = route.legs ?? [];

  return legs.find((leg) => leg.toPlaceId === placeId) ?? legs[index];
}

export function buildRouteJourneyItems(route: RecommendedRoute): RouteJourneyItem[] {
  const firstLeg = route.legs?.[0];
  const origin: RouteJourneyItem[] = firstLeg
    ? [
        {
          type: "origin",
          id: `${route.id}-origin`,
          label: "起",
          title: firstLeg.fromName
        }
      ]
    : [];

  return [
    ...origin,
    ...route.places.map((place, index) => ({
      type: "stop" as const,
      id: place.id,
      label: String(index + 1),
      title: place.name,
      address: place.address ?? "地址待确认",
      legLabel: formatRouteLegLabel(legForPlace(route, place.id, index)),
      tags: place.tags
    }))
  ];
}
