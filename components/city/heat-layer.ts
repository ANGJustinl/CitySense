import type { HeatCategoryId } from "@/shared/heat-categories";

export type LngLat = [lng: number, lat: number];

export type HeatRawPoint = {
  lng: number;
  lat: number;
  weight: number;
  category?: HeatCategoryId;
  categoryLabel?: string;
  name?: string;
  source?: string;
};

export type HeatRenderPoint = {
  lng: number;
  lat: number;
  value: number;
  category?: HeatCategoryId;
  categoryLabel?: string;
  name?: string;
  source?: string;
};

export type HeatAggregatePoint = HeatRenderPoint & {
  count: number;
  names: string[];
  sources: string[];
  maxValue: number;
  totalValue: number;
};

export type HeatRouteGeometry = {
  path: LngLat[];
  points: { position: LngLat }[];
};

const METERS_PER_DEGREE_LATITUDE = 111_320;
const ROUTE_HEAT_CORRIDOR_METERS = 900;
const ROUTE_HEAT_CORE_METERS = 240;
const HEAT_CLUSTER_RADIUS_METERS = 280;

function isFiniteLngLat(point: Pick<HeatRawPoint, "lng" | "lat">) {
  return Number.isFinite(point.lng) && Number.isFinite(point.lat);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function metersPerDegreeLongitude(latitude: number) {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
}

function toMeters(point: LngLat, originLat: number) {
  return {
    x: point[0] * metersPerDegreeLongitude(originLat),
    y: point[1] * METERS_PER_DEGREE_LATITUDE
  };
}

function distanceToSegmentMeters(point: LngLat, start: LngLat, end: LngLat) {
  const originLat = point[1];
  const p = toMeters(point, originLat);
  const a = toMeters(start, originLat);
  const b = toMeters(end, originLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  const projectedX = a.x + t * dx;
  const projectedY = a.y + t * dy;

  return Math.hypot(p.x - projectedX, p.y - projectedY);
}

function distanceBetweenMeters(a: LngLat, b: LngLat) {
  const originLat = (a[1] + b[1]) / 2;
  const aMeters = toMeters(a, originLat);
  const bMeters = toMeters(b, originLat);

  return Math.hypot(aMeters.x - bMeters.x, aMeters.y - bMeters.y);
}

function routePath(geometry: HeatRouteGeometry): LngLat[] {
  if (geometry.path.length > 0) {
    return geometry.path;
  }

  return geometry.points.map((point) => point.position);
}

export function distanceToRouteMeters(point: Pick<HeatRawPoint, "lng" | "lat">, geometry: HeatRouteGeometry) {
  const path = routePath(geometry);

  if (path.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const lngLat: LngLat = [point.lng, point.lat];

  if (path.length === 1) {
    return distanceBetweenMeters(lngLat, path[0]);
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < path.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      distanceToSegmentMeters(lngLat, path[index - 1], path[index])
    );
  }

  return minDistance;
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = clamp(ratio, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const progress = index - lower;

  return sortedValues[lower] * (1 - progress) + sortedValues[upper] * progress;
}

export function normalizeHeatWeights(points: HeatRawPoint[]): HeatRenderPoint[] {
  const validPoints = points.filter(
    (point) => isFiniteLngLat(point) && Number.isFinite(point.weight) && point.weight > 0
  );

  if (validPoints.length === 0) {
    return [];
  }

  const sortedWeights = validPoints.map((point) => point.weight).sort((a, b) => a - b);
  const lowerBound = percentile(sortedWeights, 0.08);
  const upperBound = percentile(sortedWeights, 0.96);
  const flatWeights = upperBound - lowerBound < 1;

  return validPoints.map((point) => {
    const base = flatWeights
      ? clamp(point.weight / 100, 0, 1)
      : clamp((point.weight - lowerBound) / (upperBound - lowerBound), 0, 1);
    const shaped = Math.pow(base, 0.86);
    const value = Math.round((flatWeights ? 18 : 6) + shaped * (flatWeights ? 82 : 94));

    return {
      lng: Number(point.lng.toFixed(6)),
      lat: Number(point.lat.toFixed(6)),
      value: clamp(value, 1, 100),
      category: point.category,
      categoryLabel: point.categoryLabel,
      name: point.name,
      source: point.source
    };
  });
}

export function buildRouteCorridorHeatPoints(
  points: HeatRawPoint[],
  geometries: HeatRouteGeometry[]
): HeatRenderPoint[] {
  const usableGeometries = geometries.filter((geometry) => routePath(geometry).length > 0);

  if (usableGeometries.length === 0) {
    return normalizeHeatWeights(points);
  }

  const corridorPoints = points.flatMap((point) => {
    if (!isFiniteLngLat(point) || !Number.isFinite(point.weight) || point.weight <= 0) {
      return [];
    }

    const nearestDistance = usableGeometries.reduce(
      (minDistance, geometry) => Math.min(minDistance, distanceToRouteMeters(point, geometry)),
      Number.POSITIVE_INFINITY
    );

    if (!Number.isFinite(nearestDistance) || nearestDistance > ROUTE_HEAT_CORRIDOR_METERS) {
      return [];
    }

    const proximity = 1 - nearestDistance / ROUTE_HEAT_CORRIDOR_METERS;
    const coreBoost = nearestDistance <= ROUTE_HEAT_CORE_METERS ? 1.12 : 1;
    const corridorWeight =
      point.weight * (0.32 + 0.68 * Math.pow(proximity, 1.35)) * coreBoost;

    return [{ ...point, weight: corridorWeight }];
  });

  return normalizeHeatWeights(corridorPoints);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function aggregateValue(input: { count: number; maxValue: number; totalValue: number }) {
  return clamp(
    Math.round(input.maxValue + Math.log2(input.count) * 14 + Math.min(18, input.totalValue / 25)),
    1,
    100
  );
}

export function aggregateHeatPoints(
  points: HeatRenderPoint[],
  radiusMeters = HEAT_CLUSTER_RADIUS_METERS
): HeatAggregatePoint[] {
  const clusters: HeatAggregatePoint[] = [];
  const sortedPoints = [...points]
    .filter((point) => isFiniteLngLat(point) && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => {
      const categoryOrder = (a.category ?? "").localeCompare(b.category ?? "");

      return categoryOrder || b.value - a.value;
    });

  for (const point of sortedPoints) {
    const category = point.category;
    const cluster = clusters.find(
      (candidate) =>
        candidate.category === category &&
        distanceBetweenMeters([point.lng, point.lat], [candidate.lng, candidate.lat]) <= radiusMeters
    );

    if (!cluster) {
      clusters.push({
        ...point,
        count: 1,
        names: point.name ? [point.name] : [],
        sources: point.source ? [point.source] : [],
        maxValue: point.value,
        totalValue: point.value
      });
      continue;
    }

    const nextTotalValue = cluster.totalValue + point.value;
    const previousMaxValue = cluster.maxValue;
    cluster.lng = Number(
      (((cluster.lng * cluster.totalValue) + point.lng * point.value) / nextTotalValue).toFixed(6)
    );
    cluster.lat = Number(
      (((cluster.lat * cluster.totalValue) + point.lat * point.value) / nextTotalValue).toFixed(6)
    );
    cluster.count += 1;
    cluster.maxValue = Math.max(cluster.maxValue, point.value);
    cluster.totalValue = nextTotalValue;
    cluster.value = aggregateValue(cluster);
    cluster.names = unique([...cluster.names, point.name ?? ""]).slice(0, 4);
    cluster.sources = unique([...cluster.sources, point.source ?? ""]).slice(0, 4);

    if (point.value >= previousMaxValue) {
      cluster.name = point.name ?? cluster.name;
      cluster.source = point.source ?? cluster.source;
      cluster.categoryLabel = point.categoryLabel ?? cluster.categoryLabel;
    }
  }

  return clusters.map((cluster) => ({
    ...cluster,
    value: aggregateValue(cluster)
  }));
}
