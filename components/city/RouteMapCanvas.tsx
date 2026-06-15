"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPinned, Route } from "lucide-react";
import type { Budget, Mood, RecommendedRoute } from "@/server/recommendation/types";
import {
  buildRouteChoiceSummary,
  buildRoutePersona,
  type RouteChoiceSummary,
  type RoutePersona
} from "@/components/city/route-display";
import {
  aggregateHeatPoints,
  buildRouteCorridorHeatPoints,
  type HeatAggregatePoint,
  type HeatRenderPoint,
  type HeatRawPoint
} from "@/components/city/heat-layer";
import {
  loadAmap,
  loadLoca,
  type AMapEventTarget,
  type AMapMap,
  type AMapNamespace,
  type LocaContainer,
  type LocaHexagonLayer,
  type LocaNamespace
} from "@/components/city/amap-loader";
import { PreviewableImage } from "@/components/city/ImagePreview";
import {
  HEAT_CATEGORIES,
  heatCategoryById,
  heatCategoryForTags,
  type HeatCategoryId
} from "@/shared/heat-categories";

export const ROUTE_TONES = ["teal", "coral", "amber"] as const;

export type RouteTone = (typeof ROUTE_TONES)[number];

export type HeatMode = "pulse" | "trend" | "quiet" | "match";

export type HeatContext = {
  city: string;
  area?: string;
  interests: string[];
  mood: Mood;
  budget: Budget;
};

const HEAT_MODE_OPTIONS: {
  value: HeatMode | "off";
  label: string;
  caption: string;
}[] = [
  { value: "off", label: "关闭", caption: "" },
  {
    value: "pulse",
    label: "脉搏",
    caption: "路线周边热度（趋势×质量）"
  },
  {
    value: "trend",
    label: "趋势",
    caption: "路线附近社交热度"
  },
  {
    value: "quiet",
    label: "安静",
    caption: "路线附近安静聚集区"
  },
  {
    value: "match",
    label: "兴趣",
    caption: "路线附近兴趣匹配度"
  }
];

const HEAT_ROUTE_POINT_WEIGHT = 86;
const HEAT_HEX_RADIUS_METERS = 260;
const HEAT_LAYER_Z_INDEX = 42;
const HEAT_INFO_MARKER_Z_INDEX = 48;
const HEAT_INFO_MARKER_LIMIT = 5;
const HEAT_INFO_MIN_VALUE = 58;

type HeatCacheEntry = {
  key: string;
  points: HeatRawPoint[];
};

type HeatCategoryCounts = Partial<Record<HeatCategoryId, number>>;
type HeatCategorySelection = {
  key: string;
  ids: HeatCategoryId[];
};
type HeatLocaPoint = HeatRenderPoint & { category: HeatCategoryId };
type HeatDisplayPoint = HeatAggregatePoint & { category: HeatCategoryId };

const TONE_COLORS: Record<RouteTone, string> = {
  teal: "#087f7a",
  coral: "#c7583a",
  amber: "#b78419"
};

export function routeToneAt(index: number): RouteTone {
  return ROUTE_TONES[index % ROUTE_TONES.length];
}

type LngLat = [lng: number, lat: number];

type RouteGeometry = {
  routeId: string;
  title: string;
  tone: RouteTone;
  persona: RoutePersona;
  summary: RouteChoiceSummary;
  // path 是线条几何（有 legs 时为真实道路 polyline），points 是站点 marker。
  path: LngLat[];
  points: {
    id: string;
    name: string;
    index: number;
    label: string;
    kind: "origin" | "stop";
    imageUrl?: string;
    featured?: boolean;
    position: LngLat;
  }[];
};

type RouteMapCanvasProps = {
  routes: RecommendedRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  isLoading?: boolean;
  heatContext?: HeatContext;
};

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

function buildGeometries(routes: RecommendedRoute[]): RouteGeometry[] {
  return routes.map((route, routeIndex) => {
    const persona = buildRoutePersona(route);
    const summary = buildRouteChoiceSummary(route);
    const firstLeg = route.legs?.[0];
    const originPosition = firstLeg?.polyline?.[0];
    const originPoint =
      firstLeg &&
      Array.isArray(originPosition) &&
      Number.isFinite(originPosition[0]) &&
      Number.isFinite(originPosition[1])
        ? [
            {
              id: `${route.id}-origin`,
              name: firstLeg.fromName,
              index: 0,
              label: "起",
              kind: "origin" as const,
              position: [
                roundCoordinate(originPosition[0]),
                roundCoordinate(originPosition[1])
              ] as LngLat
            }
          ]
        : [];
    const stopPoints = route.places
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .map((place, placeIndex) => ({
        id: place.id,
        name: place.name,
        index: placeIndex + 1,
        label: String(placeIndex + 1),
        kind: "stop" as const,
        imageUrl: place.imageUrl,
        featured: persona.representativePlace.id === place.id,
        position: [roundCoordinate(place.lng as number), roundCoordinate(place.lat as number)] as LngLat
      }));
    const points = [...originPoint, ...stopPoints];
    const legPath = (route.legs ?? [])
      .flatMap((leg) => leg.polyline)
      .filter(
        (point): point is LngLat =>
          Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
      );

    return {
      routeId: route.id,
      title: route.title,
      tone: routeToneAt(routeIndex),
      persona,
      summary,
      path: legPath.length >= 2 ? legPath : points.map((point) => point.position),
      points
    };
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function markerContent(
  geometry: RouteGeometry,
  point: RouteGeometry["points"][number],
  selected: boolean
) {
  const classNames = [
    "map-stop-marker",
    `tone-${geometry.tone}`,
    point.kind,
    point.featured ? "featured" : "",
    safeImageUrl(point.imageUrl) ? "with-image" : "",
    selected ? "selected" : "dimmed"
  ].filter(Boolean);
  const imageUrl = safeImageUrl(point.imageUrl);
  const label = escapeHtml(point.label);
  const name = escapeHtml(point.name);

  return `
    <div class="map-stop-marker-wrap ${selected ? "selected" : "dimmed"}">
      <div class="${classNames.join(" ")}">
        ${
          imageUrl && point.kind === "stop"
            ? `<img alt="" src="${escapeHtml(imageUrl)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
            : ""
        }
        <span>${label}</span>
      </div>
      ${selected && point.kind === "stop" ? `<em>${name}</em>` : ""}
    </div>
  `;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgba(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function heatHexColor(color: string, value: number) {
  if (value >= 88) {
    return rgba(color, 0.98);
  }

  if (value >= 72) {
    return rgba(color, 0.86);
  }

  if (value >= 52) {
    return rgba(color, 0.68);
  }

  if (value >= 32) {
    return rgba(color, 0.48);
  }

  return rgba(color, 0.28);
}

type LocaFeatureLike = {
  value?: unknown;
  max?: unknown;
  properties?: Record<string, unknown>;
  features?: unknown;
  coordinates?: unknown;
};

function heatPointValueFromUnknown(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return 0;
  }

  const record = input as Record<string, unknown>;
  const properties = typeof record.properties === "object" && record.properties !== null
    ? (record.properties as Record<string, unknown>)
    : {};
  const value = Number(record.value ?? properties.value ?? properties.count);

  return Number.isFinite(value) ? value : 0;
}

function locaFeatureAggregateValue(feature?: LocaFeatureLike) {
  if (!feature) {
    return 0;
  }

  const properties = feature.properties ?? {};
  const direct = Number(
    feature.value ?? properties.value ?? properties.sum ?? properties.count ?? properties._sum
  );

  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  for (const bucket of [
    properties.rawData,
    properties.data,
    properties.children,
    feature.features,
    feature.coordinates
  ]) {
    if (!Array.isArray(bucket)) {
      continue;
    }

    const total = bucket.reduce((sum, item) => sum + heatPointValueFromUnknown(item), 0);

    if (total > 0) {
      return total;
    }

    if (bucket.length > 0) {
      return bucket.length * 32;
    }
  }

  return 0;
}

function heatHexStyleValue(feature?: LocaFeatureLike) {
  const value = locaFeatureAggregateValue(feature);
  const max = Number(feature?.max);

  if (Number.isFinite(max) && max > 100 && value <= max) {
    return (value / max) * 100;
  }

  return Math.min(100, value);
}

function heatHexOptions(category: (typeof HEAT_CATEGORIES)[number]) {
  return {
    unit: "meter",
    radius: HEAT_HEX_RADIUS_METERS,
    gap: 0,
    altitude: 0,
    height: (_index: number, feature?: LocaFeatureLike) =>
      Math.round(10 + heatHexStyleValue(feature) * 0.9),
    value: (_index: number, feature?: LocaFeatureLike) => locaFeatureAggregateValue(feature),
    topColor: (_index: number, feature?: LocaFeatureLike) =>
      heatHexColor(category.color, heatHexStyleValue(feature)),
    sideTopColor: (_index: number, feature?: LocaFeatureLike) =>
      heatHexColor(category.color, heatHexStyleValue(feature) * 0.95),
    sideBottomColor: rgba(category.color, 0.22)
  };
}

function buildLocaHeatFeatures(points: HeatLocaPoint[]) {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.lng, point.lat]
      },
      properties: {
        value: point.value,
        count: point.value,
        category: point.category,
        categoryLabel: point.categoryLabel,
        name: point.name,
        source: point.source
      }
    }))
  };
}

function buildLocaHeatRows(points: HeatLocaPoint[]) {
  return points.map((point) => ({
    lnglat: [point.lng, point.lat],
    value: point.value,
    count: point.value,
    category: point.category,
    categoryLabel: point.categoryLabel,
    name: point.name,
    source: point.source
  }));
}

function setLocaHexLayerData(
  layer: LocaHexagonLayer,
  Loca: LocaNamespace,
  category: (typeof HEAT_CATEGORIES)[number],
  points: HeatLocaPoint[]
) {
  const options = heatHexOptions(category);
  const geoJson = buildLocaHeatFeatures(points);
  const source = Loca.GeoJSONSource ? new Loca.GeoJSONSource({ data: geoJson }) : geoJson;

  if (layer.setSource) {
    layer.setSource(source);
  } else if (layer.setData) {
    layer.setData(buildLocaHeatRows(points), {
      lnglat: "lnglat",
      value: "value"
    });
  }

  layer.setOptions?.(options);
  layer.setStyle?.(options);
}

function sourceLabel(source?: string) {
  if (!source) {
    return "路线地点";
  }

  const labels: Record<string, string> = {
    "amap-poi": "高德",
    damai: "大麦",
    xiaohongshu: "小红书",
    "shanghai-gov": "政务",
    "trends-hub": "趋势"
  };

  return labels[source] ?? source;
}

function heatInfoContent(
  point: HeatDisplayPoint,
  category: (typeof HEAT_CATEGORIES)[number]
) {
  const name = escapeHtml(
    point.names.length > 1
      ? `${point.names[0]} 等 ${point.count} 个地点`
      : point.name ?? point.names[0] ?? category.label
  );
  const label = escapeHtml(point.categoryLabel ?? category.label);
  const source = escapeHtml(
    point.sources.length > 1
      ? point.sources.map(sourceLabel).slice(0, 2).join(" / ")
      : sourceLabel(point.source ?? point.sources[0])
  );
  const countLabel = point.count > 1 ? ` · ${point.count}点` : "";

  return `
    <div class="map-heat-info-marker" style="--heat-color: ${category.color}">
      <span><i></i>${label} · ${Math.round(point.value)}${countLabel}</span>
      <strong>${name}</strong>
      <small>${source}</small>
    </div>
  `;
}

function buildRouteHeatSeeds(routes: RecommendedRoute[]): HeatRawPoint[] {
  return routes.flatMap((route, routeIndex) =>
    route.places.flatMap((place, placeIndex) => {
      if (!Number.isFinite(place.lng) || !Number.isFinite(place.lat)) {
        return [];
      }

      const category = heatCategoryForTags({
        tags: place.tags,
        source: place.source
      });

      return [
        {
          lng: place.lng as number,
          lat: place.lat as number,
          weight: Math.max(58, HEAT_ROUTE_POINT_WEIGHT - routeIndex * 8 - placeIndex * 3),
          category,
          categoryLabel: heatCategoryById(category).label,
          name: place.name,
          source: place.source ?? "route"
        }
      ];
    })
  );
}

function defaultHeatCategoriesForContext(context?: HeatContext): HeatCategoryId[] {
  if (!context) {
    return ["coffee", "food", "culture"];
  }

  const categories = new Set<HeatCategoryId>();

  for (const interest of context.interests) {
    categories.add(heatCategoryForTags({ tags: [interest] }));
  }

  if (context.mood === "quiet") {
    categories.add("quiet");
  }

  if (categories.size === 0) {
    return ["coffee", "food", "culture"];
  }

  return [...categories];
}

function heatCategorySelectionForContext(context?: HeatContext): HeatCategorySelection {
  const ids = defaultHeatCategoriesForContext(context);

  return {
    key: ids.join("|"),
    ids
  };
}

export function RouteMapCanvas({
  routes,
  selectedRouteId,
  onSelectRoute,
  isLoading,
  heatContext
}: RouteMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const namespaceRef = useRef<AMapNamespace | null>(null);
  const locaNamespaceRef = useRef<LocaNamespace | null>(null);
  const locaContainerRef = useRef<LocaContainer | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const fitSignatureRef = useRef<string>("");
  const onSelectRef = useRef(onSelectRoute);
  const heatLayerRefs = useRef<Map<HeatCategoryId, LocaHexagonLayer>>(new Map());
  const heatInfoOverlayRefs = useRef<unknown[]>([]);
  const heatCacheRef = useRef<Map<string, HeatCacheEntry>>(new Map());
  const [status, setStatus] = useState<"static" | "loading" | "ready" | "error">("static");
  const [heatMode, setHeatMode] = useState<HeatMode | "off">("off");
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatCategorySelection, setHeatCategorySelection] = useState<HeatCategorySelection>(
    () => heatCategorySelectionForContext(heatContext)
  );
  const [heatCategoryCounts, setHeatCategoryCounts] = useState<HeatCategoryCounts>({});
  const activeHeatCaption =
    heatMode === "off"
      ? ""
      : HEAT_MODE_OPTIONS.find((option) => option.value === heatMode)?.caption ?? "";
  const jsApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
  const geometries = useMemo(() => buildGeometries(routes), [routes]);
  const drawableGeometries = useMemo(
    () => geometries.filter((geometry) => geometry.points.length > 0),
    [geometries]
  );
  const selectedGeometry =
    geometries.find((geometry) => geometry.routeId === selectedRouteId) ?? geometries[0];
  const effectiveSelectedRouteId = selectedGeometry?.routeId;
  const canRenderAmap = Boolean(jsApiKey && drawableGeometries.length > 0);
  const routeHeatSeeds = useMemo(() => buildRouteHeatSeeds(routes), [routes]);
  const defaultHeatCategorySelection = useMemo(
    () => heatCategorySelectionForContext(heatContext),
    [heatContext]
  );
  const activeHeatCategories =
    heatCategorySelection.key === defaultHeatCategorySelection.key
      ? heatCategorySelection.ids
      : defaultHeatCategorySelection.ids;
  const activeHeatCategorySet = useMemo(
    () => new Set(activeHeatCategories),
    [activeHeatCategories]
  );

  const fetchHeatPoints = useCallback(
    async (
      mode: HeatMode,
      context: HeatContext
    ): Promise<{ points: HeatRawPoint[] } | null> => {
      const params = new URLSearchParams({
        city: context.city,
        mode
      });

      if (context.area) {
        params.set("area", context.area);
      }

      if (mode === "match") {
        if (context.interests.length > 0) {
          params.set("interests", context.interests.join(","));
        }
        params.set("mood", context.mood);
        params.set("budget", context.budget);
      }

      try {
        const response = await fetch(`/api/heat-points?${params.toString()}`);

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as {
          points: {
            lng: number;
            lat: number;
            weight: number;
            category?: HeatCategoryId;
            categoryLabel?: string;
            name?: string;
            source?: string;
          }[];
        };
        const points = data.points.filter(
          (point) =>
            Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.weight > 0
        );

        if (points.length === 0) {
          return { points: [] };
        }

        return {
          points: points.map((point) => ({
            lng: point.lng,
            lat: point.lat,
            weight: point.weight,
            category: heatCategoryById(point.category).id,
            categoryLabel: point.categoryLabel,
            name: point.name,
            source: point.source
          }))
        };
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    onSelectRef.current = onSelectRoute;
  }, [onSelectRoute]);

  const toggleHeatCategory = useCallback((categoryId: HeatCategoryId) => {
    setHeatCategorySelection((current) => {
      const baseIds =
        current.key === defaultHeatCategorySelection.key
          ? current.ids
          : defaultHeatCategorySelection.ids;
      const nextIds = baseIds.includes(categoryId)
        ? baseIds.filter((id) => id !== categoryId)
        : [...baseIds, categoryId];

      return {
        key: defaultHeatCategorySelection.key,
        ids: nextIds
      };
    });
  }, [defaultHeatCategorySelection]);

  useEffect(() => {
    if (!canRenderAmap || !containerRef.current || !jsApiKey) {
      setStatus("static");
      return;
    }

    const key = jsApiKey;
    const heatLayers = heatLayerRefs.current;
    let disposed = false;

    async function createMap() {
      setStatus("loading");

      try {
        const AMap = await loadAmap({ key, securityJsCode });

        if (!containerRef.current || disposed) {
          return;
        }

        const instance = new AMap.Map(containerRef.current, {
          center: drawableGeometries[0]?.points[0]?.position ?? [121.459, 31.224],
          zoom: 12,
          mapStyle: "amap://styles/whitesmoke",
          viewMode: "3D",
          features: ["bg", "road", "point"],
          resizeEnable: true,
          pitch: 0,
          rotation: 0,
          showBuildingBlock: false
        });

        instance.addControl(new AMap.Scale());
        instance.addControl(new AMap.ToolBar());
        namespaceRef.current = AMap;
        mapRef.current = instance;
        fitSignatureRef.current = "";
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }

    void createMap();

    return () => {
      disposed = true;
      overlaysRef.current = [];
      if (heatInfoOverlayRefs.current.length > 0) {
        try {
          mapRef.current?.remove(heatInfoOverlayRefs.current);
        } catch {
          // 忽略销毁错误，地图实例也会被销毁。
        }
        heatInfoOverlayRefs.current = [];
      }
      for (const layer of heatLayers.values()) {
        try {
          locaContainerRef.current?.remove(layer);
          layer.destroy();
        } catch {
          // 忽略销毁错误，地图实例也会被销毁。
        }
      }
      heatLayers.clear();
      locaContainerRef.current?.destroy?.();
      locaContainerRef.current = null;
      locaNamespaceRef.current = null;
      namespaceRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      setStatus("static");
    };
    // 地图实例只随 key 重建；路线与选中态变化由下方 overlay effect 处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderAmap, jsApiKey, securityJsCode]);

  useEffect(() => {
    const AMap = namespaceRef.current;
    const map = mapRef.current;

    if (status !== "ready" || !AMap || !map) {
      return;
    }

    if (overlaysRef.current.length > 0) {
      map.remove(overlaysRef.current);
      overlaysRef.current = [];
    }

    const overlays: unknown[] = [];

    for (const geometry of drawableGeometries) {
      const selected = geometry.routeId === effectiveSelectedRouteId;
      const color = TONE_COLORS[geometry.tone];
      if (selected) {
        const glow = new AMap.Polyline({
          path: geometry.path,
          strokeColor: color,
          strokeOpacity: 0.18,
          strokeWeight: 16,
          strokeStyle: "solid",
          lineJoin: "round",
          zIndex: 55
        });

        overlays.push(glow);
      }
      const polyline = new AMap.Polyline({
        path: geometry.path,
        strokeColor: color,
        strokeOpacity: selected ? 0.96 : 0.24,
        strokeWeight: selected ? 7 : 3,
        strokeStyle: "solid",
        lineJoin: "round",
        cursor: "pointer",
        zIndex: selected ? 60 : 40
      });

      (polyline as AMapEventTarget).on("click", () => onSelectRef.current(geometry.routeId));
      overlays.push(polyline);

      for (const point of geometry.points) {
        const marker = new AMap.Marker({
          position: point.position,
          title: point.name,
          anchor: "center",
          content: markerContent(geometry, point, selected),
          zIndex: selected ? 70 : 50
        });

        (marker as AMapEventTarget).on("click", () => onSelectRef.current(geometry.routeId));
        overlays.push(marker);
      }
    }

    map.add(overlays);
    overlaysRef.current = overlays;

    const fitSignature = drawableGeometries
      .map(
        (geometry) =>
          `${geometry.routeId}:${geometry.path.length}:${geometry.points
            .map((point) => point.position.join(","))
            .join(";")}`
      )
      .join("|");

    if (fitSignature !== fitSignatureRef.current) {
      fitSignatureRef.current = fitSignature;
      map.setFitView(overlays, false, [64, 64, 64, 64]);
    }
  }, [drawableGeometries, effectiveSelectedRouteId, status]);

  // 热力图层独立 effect：只在 heatMode !== "off" 且地图就绪时拉取并渲染，
  // 不干扰上方路线 overlay effect。fetch 结果按 cacheKey 缓存，避免切换模式时重复请求。
  useEffect(() => {
    const AMap = namespaceRef.current;
    const map = mapRef.current;

    if (status !== "ready" || !AMap || !map || !jsApiKey) {
      return;
    }

    const mapInstance = map;
    const AMapNamespace = AMap;
    const key = jsApiKey;
    let cancelled = false;

    function clearHeatLayers() {
      if (heatInfoOverlayRefs.current.length > 0) {
        mapInstance.remove(heatInfoOverlayRefs.current);
        heatInfoOverlayRefs.current = [];
      }

      for (const layer of heatLayerRefs.current.values()) {
        try {
          locaContainerRef.current?.remove(layer);
          layer.destroy();
        } catch {
          // Loca 图层销毁失败不应影响下一次重绘。
        }
      }

      heatLayerRefs.current.clear();
    }

    async function ensureLoca() {
      if (locaNamespaceRef.current && locaContainerRef.current) {
        return {
          Loca: locaNamespaceRef.current,
          container: locaContainerRef.current
        };
      }

      const Loca = await loadLoca({ key });

      if (cancelled) {
        return null;
      }

      const container = new Loca.Container({ map: mapInstance });
      locaNamespaceRef.current = Loca;
      locaContainerRef.current = container;

      return { Loca, container };
    }

    async function applyHeat() {
      if (heatMode === "off") {
        clearHeatLayers();
        setHeatCategoryCounts({});
        setHeatLoading(false);
        return;
      }

      if (!heatContext) {
        clearHeatLayers();
        setHeatCategoryCounts({});
        setHeatLoading(false);
        return;
      }

      const cacheKey = [
        heatMode,
        heatContext.city,
        heatContext.area ?? "",
        heatMode === "match" ? heatContext.interests.join(",") : "",
        heatMode === "match" ? heatContext.mood : "",
        heatMode === "match" ? heatContext.budget : ""
      ].join("|");

      let entry = heatCacheRef.current.get(cacheKey);

      if (!entry) {
        setHeatLoading(true);
        const fetched = await fetchHeatPoints(heatMode, heatContext);

        if (cancelled) {
          return;
        }

        if (!fetched) {
          clearHeatLayers();
          setHeatLoading(false);
          return;
        }

        entry = { key: cacheKey, points: fetched.points };
        heatCacheRef.current.set(cacheKey, entry);
      }

      const heatPoints: HeatLocaPoint[] = buildRouteCorridorHeatPoints(
        [...entry.points, ...routeHeatSeeds],
        drawableGeometries
      ).map((point) => {
        const category = heatCategoryById(point.category);

        return {
          ...point,
          category: category.id,
          categoryLabel: point.categoryLabel ?? category.label
        };
      });

      if (cancelled || heatPoints.length === 0) {
        clearHeatLayers();
        setHeatCategoryCounts({});
        setHeatLoading(false);
        return;
      }

      const counts = HEAT_CATEGORIES.reduce<HeatCategoryCounts>((accumulator, category) => {
        accumulator[category.id] = 0;

        return accumulator;
      }, {});

      for (const point of heatPoints) {
        counts[point.category] = (counts[point.category] ?? 0) + 1;
      }

      setHeatCategoryCounts(counts);
      if (activeHeatCategorySet.size === 0) {
        clearHeatLayers();
        setHeatLoading(false);
        return;
      }

      setHeatLoading(true);
      clearHeatLayers();

      const loca = await ensureLoca();

      if (cancelled || !loca) {
        setHeatLoading(false);
        return;
      }

      for (const category of HEAT_CATEGORIES) {
        const categoryPoints = heatPoints.filter((point) => point.category === category.id);

        if (categoryPoints.length === 0 || !activeHeatCategorySet.has(category.id)) {
          continue;
        }

        const layer = new loca.Loca.HexagonLayer({
          loca: loca.container,
          zIndex: HEAT_LAYER_Z_INDEX,
          opacity: 0.92,
          visible: true,
          zooms: [10, 18],
          depth: false,
          acceptLight: false,
          hasSide: true
        });

        setLocaHexLayerData(layer, loca.Loca, category, categoryPoints);
        loca.container.add(layer);
        layer.show();
        heatLayerRefs.current.set(category.id, layer);
      }

      loca.container.requestRender?.();
      loca.container.render?.();

      const infoMarkers = aggregateHeatPoints(heatPoints)
        .map((point) => ({
          ...point,
          category: heatCategoryById(point.category).id
        }))
        .filter((point): point is HeatDisplayPoint => activeHeatCategorySet.has(point.category))
        .filter((point) => point.name && point.value >= HEAT_INFO_MIN_VALUE)
        .sort((a, b) => b.value - a.value)
        .slice(0, HEAT_INFO_MARKER_LIMIT)
        .map((point) => {
          const category = heatCategoryById(point.category);

          return new AMapNamespace.Marker({
            position: [point.lng, point.lat],
            anchor: "bottom-left",
            content: heatInfoContent(point, category),
            zIndex: HEAT_INFO_MARKER_Z_INDEX
          });
        });

      if (infoMarkers.length > 0) {
        mapInstance.add(infoMarkers);
        heatInfoOverlayRefs.current = infoMarkers;
      }

      setHeatLoading(false);
    }

    void applyHeat().catch(() => {
      clearHeatLayers();
      setHeatLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    heatMode,
    heatContext,
    drawableGeometries,
    routeHeatSeeds,
    activeHeatCategorySet,
    status,
    jsApiKey,
    fetchHeatPoints
  ]);

  return (
    <div
      className={[
        "map-canvas-panel",
        heatContext && status === "ready" ? "with-heat-control" : "",
        heatMode !== "off" && status === "ready" ? "with-heat-layer" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="map-canvas" ref={containerRef}>
        {status !== "ready" ? (
          <StaticMultiRouteMap
            geometries={drawableGeometries}
            onSelectRoute={onSelectRoute}
            selectedRouteId={effectiveSelectedRouteId}
            status={status}
          />
        ) : null}
      </div>

      {geometries.length > 0 ? (
        <div className="map-legend" role="group" aria-label="route legend">
          {geometries.map((geometry, index) => (
            <button
              className={
                geometry.routeId === effectiveSelectedRouteId
                  ? `map-legend-chip tone-${geometry.tone} active`
                  : `map-legend-chip tone-${geometry.tone}`
              }
              key={geometry.routeId}
              onClick={() => onSelectRoute(geometry.routeId)}
              type="button"
            >
              <i />
              <span>路线 {index + 1}</span>
              <strong>{geometry.persona.themeName}</strong>
              <small>{geometry.summary.durationLabel}</small>
              <span className="map-legend-tags">
                {geometry.persona.tags.length > 0
                  ? geometry.persona.tags.slice(0, 3).join(" / ")
                  : "城市探索"}
              </span>
              {index === 0 ? <em>Top</em> : null}
            </button>
          ))}
        </div>
      ) : null}

      {heatContext && status === "ready" ? (
        <div className="map-heat-control" role="group" aria-label="heat layer mode">
          <div className="map-heat-title">
            <span>路线热度</span>
            {heatLoading ? <Loader2 className="spin" size={11} /> : null}
          </div>
          <div className="segmented compact">
            {HEAT_MODE_OPTIONS.map((option) => (
              <button
                className={heatMode === option.value ? "active" : ""}
                key={option.value}
                onClick={() => setHeatMode(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {activeHeatCaption ? (
            <p className="map-heat-caption">{activeHeatCaption}</p>
          ) : null}
        </div>
      ) : null}

      {heatMode !== "off" && status === "ready" ? (
        <div className="map-heat-legend" aria-label="heat category filter">
          <div className="map-heat-legend-title">颜色分类</div>
          <div className="map-heat-category-list">
            {HEAT_CATEGORIES.map((category) => {
              const active = activeHeatCategorySet.has(category.id);

              return (
                <button
                  className={active ? "active" : ""}
                  key={category.id}
                  onClick={() => toggleHeatCategory(category.id)}
                  type="button"
                >
                  <i style={{ background: category.color }} />
                  <span>{category.label}</span>
                  <strong>{heatCategoryCounts[category.id] ?? 0}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedGeometry ? <RouteStoryCard geometry={selectedGeometry} /> : null}

      <div className="route-map-status">
        <Route size={15} />
        {status === "ready"
          ? "高德地图"
          : status === "loading"
            ? "加载地图"
            : "静态预览"}
      </div>

      {isLoading ? (
        <div className="map-loading-veil" aria-live="polite">
          <Loader2 className="spin" size={22} />
          <span>正在召回候选并重排交通…</span>
        </div>
      ) : null}
    </div>
  );
}

function RouteStoryCard({ geometry }: { geometry: RouteGeometry }) {
  const imageUrl = safeImageUrl(geometry.persona.representativePlace.imageUrl);
  const signalLabel = geometry.persona.topSignal
    ? `${geometry.persona.topSignal.label} ${geometry.persona.topSignal.score}`
    : "暂无来源信号";

  return (
    <aside className={`route-story-card tone-${geometry.tone}`} aria-label="selected route theme">
      {imageUrl ? (
        <PreviewableImage
          alt={geometry.persona.representativePlace.name}
          className="route-story-image"
          loading="lazy"
          src={imageUrl}
        />
      ) : (
        <span className="route-story-fallback">{geometry.routeId.slice(-1)}</span>
      )}
      <div>
        <span className="route-story-kicker">{geometry.persona.themeName}</span>
        <strong>{geometry.persona.representativePlace.name}</strong>
        <p>{geometry.persona.featureText}</p>
        <div className="route-story-meta">
          <span>{geometry.summary.endpointLabel}</span>
          <span>{signalLabel}</span>
        </div>
        <div className="route-story-tags">
          {geometry.persona.tags.length > 0 ? (
            geometry.persona.tags.map((tag) => <span key={tag}>{tag}</span>)
          ) : (
            <span>城市探索</span>
          )}
          <span>{geometry.summary.durationLabel}</span>
        </div>
      </div>
    </aside>
  );
}

function StaticMultiRouteMap({
  geometries,
  selectedRouteId,
  onSelectRoute,
  status
}: {
  geometries: RouteGeometry[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  status: string;
}) {
  const allPoints = geometries.flatMap((geometry) => geometry.points);
  const allCoordinates = [
    ...geometries.flatMap((geometry) => geometry.path),
    ...allPoints.map((point) => point.position)
  ];

  if (allPoints.length === 0) {
    return (
      <div className="static-multi-map">
        <div className="static-route-copy">
          <MapPinned size={22} />
          <strong>{status === "loading" ? "地图加载中" : "路线预览"}</strong>
          <p>暂无可用坐标</p>
        </div>
      </div>
    );
  }

  const lngs = allCoordinates.map((point) => point[0]);
  const lats = allCoordinates.map((point) => point[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const project = ([lng, lat]: LngLat) => ({
    x: 8 + ((lng - minLng) / lngSpan) * 84,
    y: 10 + ((maxLat - lat) / latSpan) * 76
  });

  return (
    <div className="static-multi-map">
      <svg preserveAspectRatio="none" viewBox="0 0 100 96">
        {geometries.map((geometry) => {
          const selected = geometry.routeId === selectedRouteId;
          const path = geometry.path
            .map((point) => {
              const { x, y } = project(point);

              return `${x},${y}`;
            })
            .join(" ");

          return (
            <g
              key={geometry.routeId}
              onClick={() => onSelectRoute(geometry.routeId)}
              style={{ cursor: "pointer" }}
            >
              {selected ? (
                <polyline
                  fill="none"
                  points={path}
                  stroke={TONE_COLORS[geometry.tone]}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={0.16}
                  strokeWidth={4.6}
                />
              ) : null}
              <polyline
                fill="none"
                points={path}
                stroke={TONE_COLORS[geometry.tone]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={selected ? 0.95 : 0.22}
                strokeWidth={selected ? 1.8 : 0.7}
              />
            </g>
          );
        })}
      </svg>
      <div className="static-map-marker-layer">
        {geometries.flatMap((geometry) =>
          geometry.points.map((point) => {
            const selected = geometry.routeId === selectedRouteId;
            const { x, y } = project(point.position);
            const imageUrl = safeImageUrl(point.imageUrl);

            return (
              <button
                className={[
                  "static-map-marker",
                  `tone-${geometry.tone}`,
                  point.kind,
                  point.featured ? "featured" : "",
                  selected ? "selected" : "dimmed",
                  imageUrl ? "with-image" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={`${geometry.routeId}-${point.id}`}
                onClick={() => onSelectRoute(geometry.routeId)}
                style={{
                  left: `${x}%`,
                  top: `${y}%`
                }}
                type="button"
              >
                {imageUrl && point.kind === "stop" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 外部来源图片直链需要 no-referrer，且 URL 可能过期
                  <img
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    referrerPolicy="no-referrer"
                    src={imageUrl}
                  />
                ) : null}
                <span>{point.label}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="static-route-copy">
        <MapPinned size={22} />
        <strong>{status === "loading" ? "地图加载中" : "路线预览"}</strong>
        <p>{`${geometries.length} 条路线 / ${allPoints.length} 个点位已定位`}</p>
      </div>
    </div>
  );
}
