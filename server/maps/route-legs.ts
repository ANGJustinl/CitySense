import { getAmapLegPlan, type AmapLegPlan } from "@/server/maps/amap";
import { estimateTrafficInfo } from "@/server/maps/traffic";
import { readLegPlanSnapshot, writeLegPlanSnapshot } from "@/server/maps/traffic-cache";
import type {
  RecommendedRoute,
  RouteLeg,
  TravelMode
} from "@/server/recommendation/types";

type Point = {
  lat: number;
  lng: number;
};

type LegEndpoint = {
  name: string;
  placeId?: string;
  point: Point;
};

export type PlanRouteLegsInput = {
  city: string;
  origin?: Point;
  useRealtimeTraffic?: boolean;
};

export type RouteLegsDependencies = {
  fetchLegPlan?: typeof getAmapLegPlan;
  readCache?: typeof readLegPlanSnapshot;
  writeCache?: typeof writeLegPlanSnapshot;
};

function hasCoordinates(place: RecommendedRoute["places"][number]): place is RecommendedRoute["places"][number] & {
  lat: number;
  lng: number;
} {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
}

function estimatedLeg(input: {
  from: LegEndpoint;
  to: LegEndpoint;
  mode: TravelMode;
}): RouteLeg {
  const traffic = estimateTrafficInfo({
    origin: input.from.point,
    destination: input.to.point,
    mode: input.mode
  });

  return {
    fromName: input.from.name,
    toName: input.to.name,
    toPlaceId: input.to.placeId,
    mode: input.mode,
    durationMinutes: traffic.estimatedDurationMinutes,
    distanceMeters: traffic.distanceMeters,
    congestion: traffic.congestion,
    provider: "estimated",
    polyline: [
      [input.from.point.lng, input.from.point.lat],
      [input.to.point.lng, input.to.point.lat]
    ]
  };
}

function legFromPlan(input: {
  from: LegEndpoint;
  to: LegEndpoint;
  mode: TravelMode;
  plan: AmapLegPlan;
  cacheHit: boolean;
}): RouteLeg {
  return {
    fromName: input.from.name,
    toName: input.to.name,
    toPlaceId: input.to.placeId,
    mode: input.mode,
    durationMinutes: input.plan.durationMinutes,
    distanceMeters: input.plan.distanceMeters,
    congestion: input.plan.congestion,
    provider: "amap",
    polyline: input.plan.polyline,
    transitLines: input.plan.transitLines.length > 0 ? input.plan.transitLines : undefined,
    steps: input.plan.steps.length > 0 ? input.plan.steps : undefined,
    cacheHit: input.cacheHit
  };
}

async function planLeg(input: {
  city: string;
  from: LegEndpoint;
  to: LegEndpoint;
  mode: TravelMode;
  useRealtimeTraffic?: boolean;
  deps: Required<RouteLegsDependencies>;
}): Promise<RouteLeg> {
  if (!input.useRealtimeTraffic || !process.env.AMAP_API_KEY) {
    return estimatedLeg(input);
  }

  const cacheInput = {
    city: input.city,
    origin: input.from.point,
    destination: input.to.point,
    mode: input.mode
  };
  const cached = await input.deps.readCache(cacheInput);

  if (cached) {
    return legFromPlan({
      from: input.from,
      to: input.to,
      mode: input.mode,
      plan: cached,
      cacheHit: true
    });
  }

  const plan = await input.deps.fetchLegPlan(cacheInput);

  if (!plan) {
    return estimatedLeg(input);
  }

  await input.deps.writeCache(cacheInput, plan);

  return legFromPlan({
    from: input.from,
    to: input.to,
    mode: input.mode,
    plan,
    cacheHit: false
  });
}

function combinedCongestion(legs: RouteLeg[]) {
  if (legs.some((leg) => leg.congestion === "busy")) {
    return "busy";
  }

  if (legs.some((leg) => leg.congestion === "moderate")) {
    return "moderate";
  }

  return "smooth";
}

function routeWithLegs(route: RecommendedRoute, legs: RouteLeg[]): RecommendedRoute {
  if (legs.length === 0) {
    return route;
  }

  const totalDuration = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const totalDistance = legs.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0);

  return {
    ...route,
    legs,
    summary: `${route.places.map((place) => place.name).join(" -> ")} / ${totalDuration} 分钟可达`,
    traffic: {
      ...route.traffic,
      estimatedDurationMinutes: totalDuration,
      distanceMeters: totalDistance || route.traffic.distanceMeters,
      congestion: combinedCongestion(legs),
      provider: legs.some((leg) => leg.provider === "amap") ? "amap" : route.traffic.provider,
      cacheHit: legs.length > 0 && legs.every((leg) => leg.cacheHit === true)
    }
  };
}

export async function planRouteLegs(
  route: RecommendedRoute,
  input: PlanRouteLegsInput,
  dependencies: RouteLegsDependencies = {}
): Promise<RecommendedRoute> {
  if (!input.origin) {
    return route;
  }

  const deps: Required<RouteLegsDependencies> = {
    fetchLegPlan: dependencies.fetchLegPlan ?? getAmapLegPlan,
    readCache: dependencies.readCache ?? readLegPlanSnapshot,
    writeCache: dependencies.writeCache ?? writeLegPlanSnapshot
  };
  const stops: LegEndpoint[] = route.places.filter(hasCoordinates).map((place) => ({
    name: place.name,
    placeId: place.id,
    point: {
      lat: place.lat,
      lng: place.lng
    }
  }));

  if (stops.length === 0) {
    return route;
  }

  const endpoints: LegEndpoint[] = [
    {
      name: "出发点",
      point: input.origin
    },
    ...stops
  ];
  const legs = await Promise.all(
    endpoints.slice(0, -1).map((from, index) =>
      planLeg({
        city: input.city,
        from,
        to: endpoints[index + 1],
        mode: route.traffic.mode,
        useRealtimeTraffic: input.useRealtimeTraffic,
        deps
      })
    )
  );

  return routeWithLegs(route, legs);
}

export async function planRoutesLegs(
  routes: RecommendedRoute[],
  input: PlanRouteLegsInput,
  dependencies: RouteLegsDependencies = {}
): Promise<RecommendedRoute[]> {
  return Promise.all(routes.map((route) => planRouteLegs(route, input, dependencies)));
}
