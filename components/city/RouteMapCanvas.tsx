"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPinned, Route } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import {
  buildRouteChoiceSummary,
  buildRoutePersona,
  type RouteChoiceSummary,
  type RoutePersona
} from "@/components/city/route-display";
import {
  loadAmap,
  type AMapEventTarget,
  type AMapMap,
  type AMapNamespace
} from "@/components/city/amap-loader";
import { PreviewableImage } from "@/components/city/ImagePreview";

export const ROUTE_TONES = ["teal", "coral", "amber"] as const;

export type RouteTone = (typeof ROUTE_TONES)[number];

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

export function RouteMapCanvas({
  routes,
  selectedRouteId,
  onSelectRoute,
  isLoading
}: RouteMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const namespaceRef = useRef<AMapNamespace | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const fitSignatureRef = useRef<string>("");
  const onSelectRef = useRef(onSelectRoute);
  const [status, setStatus] = useState<"static" | "loading" | "ready" | "error">("static");
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

  useEffect(() => {
    onSelectRef.current = onSelectRoute;
  }, [onSelectRoute]);

  useEffect(() => {
    if (!canRenderAmap || !containerRef.current || !jsApiKey) {
      setStatus("static");
      return;
    }

    const key = jsApiKey;
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
          viewMode: "2D"
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

  return (
    <div className="map-canvas-panel">
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
