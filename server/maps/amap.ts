import type { RouteLegStep, TrafficInfo, TravelMode } from "@/server/recommendation/types";

type Point = {
  lat: number;
  lng: number;
};

type LngLat = [lng: number, lat: number];

type AmapStep = {
  instruction?: unknown;
  road?: unknown;
  distance?: unknown;
  duration?: unknown;
  polyline?: unknown;
};

type AmapBusline = {
  name?: unknown;
  duration?: unknown;
  distance?: unknown;
  polyline?: unknown;
  departure_stop?: {
    name?: unknown;
  };
  arrival_stop?: {
    name?: unknown;
  };
};

type AmapSegment = {
  walking?: {
    distance?: unknown;
    duration?: unknown;
    steps?: AmapStep[];
  };
  bus?: {
    buslines?: AmapBusline[];
  };
};

type AmapPath = {
  distance?: string;
  duration?: string;
  steps?: AmapStep[];
};

type AmapTransit = {
  distance?: string;
  duration?: string;
  segments?: AmapSegment[];
};

type AmapRouteResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  route?: {
    paths?: AmapPath[];
    transits?: AmapTransit[];
  };
};

export type AmapLegPlan = {
  durationMinutes: number;
  distanceMeters?: number;
  congestion?: string;
  polyline: LngLat[];
  steps: RouteLegStep[];
  transitLines: string[];
};

type FetchLike = typeof fetch;

const MAX_LEG_STEPS = 20;
const MAX_LEG_POLYLINE_POINTS = 240;

function routeEndpoint(mode: TravelMode) {
  if (mode === "walking") {
    return "https://restapi.amap.com/v3/direction/walking";
  }

  if (mode === "driving") {
    return "https://restapi.amap.com/v3/direction/driving";
  }

  return "https://restapi.amap.com/v3/direction/transit/integrated";
}

function congestionFor(durationMinutes: number) {
  return durationMinutes <= 20 ? "smooth" : durationMinutes <= 40 ? "moderate" : "busy";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function minutesFromSeconds(value: unknown) {
  const seconds = numberValue(value);

  return seconds === undefined ? undefined : Math.max(1, Math.round(seconds / 60));
}

export function parseAmapPolyline(value: unknown): LngLat[] {
  // 高德把无 polyline 表达为 [] 或空串，需要按字符串严格判断。
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(";")
    .map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);

      return Number.isFinite(lng) && Number.isFinite(lat) ? ([lng, lat] as LngLat) : null;
    })
    .filter((point): point is LngLat => point !== null);
}

export function downsamplePolyline(points: LngLat[], maxPoints = MAX_LEG_POLYLINE_POINTS) {
  if (points.length <= maxPoints) {
    return points;
  }

  const stride = (points.length - 1) / (maxPoints - 1);

  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * stride)]);
}

async function fetchAmapRoute(
  input: {
    city: string;
    origin: Point;
    destination: Point;
    mode: TravelMode;
  },
  fetchFn: FetchLike
): Promise<AmapRouteResponse | null> {
  if (!process.env.AMAP_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    key: process.env.AMAP_API_KEY,
    origin: `${input.origin.lng},${input.origin.lat}`,
    destination: `${input.destination.lng},${input.destination.lat}`,
    output: "json"
  });

  if (input.mode === "transit") {
    params.set("city", input.city);
  }

  try {
    const response = await fetchFn(`${routeEndpoint(input.mode)}?${params.toString()}`, {
      next: { revalidate: 60 }
    });
    const data = (await response.json()) as AmapRouteResponse;

    return data.status === "1" ? data : null;
  } catch {
    return null;
  }
}

function stepFromAmap(step: AmapStep): RouteLegStep {
  return {
    instruction: stringValue(step.instruction)?.slice(0, 120),
    road: stringValue(step.road),
    distanceMeters: numberValue(step.distance),
    durationMinutes: minutesFromSeconds(step.duration)
  };
}

function pathLegPlan(path: AmapPath): AmapLegPlan | null {
  const durationMinutes = minutesFromSeconds(path?.duration);

  if (durationMinutes === undefined) {
    return null;
  }

  const steps = Array.isArray(path?.steps) ? path.steps : [];

  return {
    durationMinutes,
    distanceMeters: numberValue(path?.distance),
    congestion: congestionFor(durationMinutes),
    polyline: downsamplePolyline(steps.flatMap((step) => parseAmapPolyline(step.polyline))),
    steps: steps.slice(0, MAX_LEG_STEPS).map(stepFromAmap),
    transitLines: []
  };
}

function transitLegPlan(transit: AmapTransit): AmapLegPlan | null {
  const durationMinutes = minutesFromSeconds(transit?.duration);

  if (durationMinutes === undefined) {
    return null;
  }

  const segments = Array.isArray(transit?.segments) ? transit.segments : [];
  const polyline: LngLat[] = [];
  const steps: RouteLegStep[] = [];
  const transitLines: string[] = [];

  for (const segment of segments) {
    const walkingSteps = Array.isArray(segment.walking?.steps) ? segment.walking.steps : [];

    if (walkingSteps.length > 0) {
      polyline.push(...walkingSteps.flatMap((step) => parseAmapPolyline(step.polyline)));

      const walkingMinutes = minutesFromSeconds(segment.walking?.duration);

      if (walkingMinutes !== undefined) {
        steps.push({
          instruction: "步行换乘",
          distanceMeters: numberValue(segment.walking?.distance),
          durationMinutes: walkingMinutes
        });
      }
    }

    const buslines = Array.isArray(segment.bus?.buslines) ? segment.bus.buslines : [];

    for (const busline of buslines.slice(0, 1)) {
      const name = stringValue(busline.name);
      const departure = stringValue(busline.departure_stop?.name);
      const arrival = stringValue(busline.arrival_stop?.name);

      polyline.push(...parseAmapPolyline(busline.polyline));

      if (name) {
        transitLines.push(name);
      }

      steps.push({
        instruction: [
          name ? `乘坐 ${name}` : "乘坐公共交通",
          departure && arrival ? `（${departure} → ${arrival}）` : ""
        ].join(""),
        distanceMeters: numberValue(busline.distance),
        durationMinutes: minutesFromSeconds(busline.duration)
      });
    }
  }

  return {
    durationMinutes,
    distanceMeters: numberValue(transit?.distance),
    congestion: congestionFor(durationMinutes),
    polyline: downsamplePolyline(polyline),
    steps: steps.slice(0, MAX_LEG_STEPS),
    transitLines: [...new Set(transitLines)].slice(0, 5)
  };
}

export async function getAmapLegPlan(
  input: {
    city: string;
    origin: Point;
    destination: Point;
    mode: TravelMode;
  },
  fetchFn: FetchLike = fetch
): Promise<AmapLegPlan | null> {
  const data = await fetchAmapRoute(input, fetchFn);

  if (!data) {
    return null;
  }

  if (input.mode === "transit") {
    const transit = data.route?.transits?.[0];

    return transit ? transitLegPlan(transit) : null;
  }

  const path = data.route?.paths?.[0];

  return path ? pathLegPlan(path) : null;
}

export async function getAmapRouteTraffic(input: {
  city: string;
  origin: Point;
  destination: Point;
  mode: TravelMode;
}): Promise<TrafficInfo | null> {
  const data = await fetchAmapRoute(input, fetch);

  if (!data) {
    return null;
  }

  const firstPath = input.mode === "transit" ? data.route?.transits?.[0] : data.route?.paths?.[0];
  const durationMinutes = minutesFromSeconds(firstPath?.duration);
  const distance = numberValue(firstPath?.distance);

  if (durationMinutes === undefined) {
    return null;
  }

  return {
    estimatedDurationMinutes: durationMinutes,
    mode: input.mode,
    distanceMeters: distance,
    congestion: congestionFor(durationMinutes),
    provider: "amap",
    cacheHit: false,
    capturedAt: new Date().toISOString()
  };
}
