import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  RecommendInput,
  RecommendedRoute,
  CandidateType,
  TrafficCandidate
} from "@/server/recommendation/types";
import { buildRoutePersona } from "@/components/city/route-display";

export type LngLat = [lng: number, lat: number];

export type RouteMapMarker = {
  id: string;
  name: string;
  index: number;
  label: string;
  kind: "origin" | "stop";
  position: LngLat;
  address?: string;
  type?: CandidateType;
  imageUrl?: string;
  featured?: boolean;
};

export type RouteMapView = {
  provider: "amap-jsapi";
  center?: LngLat;
  bounds?: {
    southWest: LngLat;
    northEast: LngLat;
  };
  polyline: LngLat[];
  markers: RouteMapMarker[];
};

export type RouteDetailResponse = {
  route: RecommendedRoute;
  recommendation: {
    id: string;
    userId?: string;
    input: RecommendInput;
    generatedAt: string;
  };
  map: RouteMapView;
};

export function createRouteSnapshotId(recommendationId: string, routeLocalId: string) {
  return `${recommendationId}__${routeLocalId}`;
}

export function parseRouteSnapshotId(id: string) {
  const [recommendationId, routeLocalId, ...rest] = id.split("__");

  if (!recommendationId || !routeLocalId || rest.length > 0) {
    return null;
  }

  return {
    recommendationId,
    routeLocalId
  };
}

export function withRouteSnapshotIds(recommendationId: string, routes: RecommendedRoute[]) {
  return routes.map((route) => ({
    ...route,
    id: createRouteSnapshotId(recommendationId, route.id)
  }));
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

function hasCoordinates(
  place: RecommendedRoute["places"][number]
): place is RecommendedRoute["places"][number] & { lat: number; lng: number } {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildRouteMapView(route: RecommendedRoute): RouteMapView {
  const persona = buildRoutePersona(route);
  const stopMarkers = route.places
    .map<RouteMapMarker | null>((place, index) => {
      if (!hasCoordinates(place)) {
        return null;
      }

      return {
        id: place.id,
        name: place.name,
        index: index + 1,
        label: String(index + 1),
        kind: "stop" as const,
        position: [roundCoordinate(place.lng), roundCoordinate(place.lat)] as LngLat,
        ...(place.address ? { address: place.address } : {}),
        type: place.type,
        imageUrl: place.imageUrl,
        featured: persona.representativePlace.id === place.id
      };
    })
    .filter((marker): marker is RouteMapMarker => marker !== null);
  // 真实道路 polyline 来自高德分段规划；无 legs 时回退站点直线连线。
  const legPolyline = (route.legs ?? [])
    .flatMap((leg) => leg.polyline)
    .filter(
      (point): point is LngLat =>
        Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
    )
    .map(([lng, lat]) => [roundCoordinate(lng), roundCoordinate(lat)] as LngLat);
  const firstLeg = route.legs?.[0];
  const firstPoint = legPolyline[0];
  const originMarker =
    firstLeg && firstPoint
      ? {
          id: `${route.id}-origin`,
          name: firstLeg.fromName,
          index: 0,
          label: "起",
          kind: "origin" as const,
          position: firstPoint
        }
      : null;
  const markers = originMarker ? [originMarker, ...stopMarkers] : stopMarkers;
  const polyline = legPolyline.length >= 2 ? legPolyline : markers.map((marker) => marker.position);
  const lngs = polyline.map(([lng]) => lng);
  const lats = polyline.map(([, lat]) => lat);

  if (polyline.length === 0) {
    return {
      provider: "amap-jsapi",
      polyline: [],
      markers: []
    };
  }

  return {
    provider: "amap-jsapi",
    center: [
      roundCoordinate(lngs.reduce((sum, lng) => sum + lng, 0) / lngs.length),
      roundCoordinate(lats.reduce((sum, lat) => sum + lat, 0) / lats.length)
    ],
    bounds: {
      southWest: [Math.min(...lngs), Math.min(...lats)],
      northEast: [Math.max(...lngs), Math.max(...lats)]
    },
    polyline,
    markers
  };
}

async function persistFeatureSnapshots(
  recommendationId: string,
  candidates: TrafficCandidate[] | undefined
) {
  if (!candidates || candidates.length === 0) {
    return;
  }

  try {
    await prisma.recommendationFeatureSnapshot.createMany({
      data: candidates.map((candidate, index) => ({
        recommendationId,
        candidateId: candidate.id,
        candidateType: candidate.type,
        ranker: candidate.ranker,
        rankerVersion: candidate.rankerVersion,
        recallChannels: candidate.recallChannels ?? ["base"],
        features: toJson(candidate.features),
        score: candidate.adjustedScore,
        position: index + 1
      }))
    });
  } catch {
    // Feature snapshots are observability data and must not block recommendations.
  }
}

export async function persistRecommendationSnapshot(
  input: RecommendInput,
  routes: RecommendedRoute[],
  rankedCandidates?: TrafficCandidate[]
) {
  const log = await prisma.recommendationLog.create({
    data: {
      userId: input.userId,
      input: toJson(input),
      recommendedRoutes: toJson(routes)
    }
  });
  const routesWithSnapshotIds = withRouteSnapshotIds(log.id, routes);

  await prisma.recommendationLog.update({
    where: {
      id: log.id
    },
    data: {
      recommendedRoutes: toJson(routesWithSnapshotIds)
    }
  });
  await persistFeatureSnapshots(log.id, rankedCandidates);

  return {
    recommendationId: log.id,
    routes: routesWithSnapshotIds
  };
}

export async function getRouteDetail(routeSnapshotId: string): Promise<RouteDetailResponse | null> {
  const parsed = parseRouteSnapshotId(routeSnapshotId);

  if (!parsed) {
    return null;
  }

  const log = await prisma.recommendationLog.findUnique({
    where: {
      id: parsed.recommendationId
    }
  });

  if (!log || !Array.isArray(log.recommendedRoutes)) {
    return null;
  }

  const routes = log.recommendedRoutes as unknown as RecommendedRoute[];
  const route = routes.find((item) => item.id === routeSnapshotId);

  if (!route) {
    return null;
  }

  return {
    route,
    recommendation: {
      id: log.id,
      userId: log.userId ?? undefined,
      input: log.input as unknown as RecommendInput,
      generatedAt: log.createdAt.toISOString()
    },
    map: buildRouteMapView(route)
  };
}
