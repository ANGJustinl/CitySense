"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinned, Route } from "lucide-react";
import type { RouteMapView } from "@/server/routes/route-detail";
import { loadAmap, type AMapMap } from "@/components/city/amap-loader";

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

function markerContent(marker: RouteMapView["markers"][number]) {
  const imageUrl = safeImageUrl(marker.imageUrl);
  const classNames = [
    "map-stop-marker",
    marker.kind === "origin" ? "origin" : "tone-teal",
    marker.featured ? "featured" : "",
    imageUrl ? "with-image" : "",
    "selected"
  ].filter(Boolean);

  return `
    <div class="map-stop-marker-wrap selected">
      <div class="${classNames.join(" ")}">
        ${
          imageUrl && marker.kind === "stop"
            ? `<img alt="" src="${escapeHtml(imageUrl)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
            : ""
        }
        <span>${escapeHtml(marker.label)}</span>
      </div>
      ${marker.kind === "stop" ? `<em>${escapeHtml(marker.name)}</em>` : ""}
    </div>
  `;
}

function projectMapView(map: RouteMapView) {
  const coordinates = [...map.polyline, ...map.markers.map((marker) => marker.position)];

  if (coordinates.length === 0) {
    return undefined;
  }

  const lngs = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const project = ([lng, lat]: [number, number]) => ({
    x: 8 + ((lng - minLng) / lngSpan) * 84,
    y: 10 + ((maxLat - lat) / latSpan) * 76
  });

  return {
    path: map.polyline.map(project),
    markers: map.markers.map((marker) => ({
      ...marker,
      projected: project(marker.position)
    }))
  };
}

export function RouteDetailMap({ map }: { map: RouteMapView }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"static" | "loading" | "ready" | "error">("static");
  const jsApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
  const canRenderAmap = Boolean(jsApiKey && map.center && map.polyline.length > 0);

  useEffect(() => {
    if (!canRenderAmap || !containerRef.current || !jsApiKey) {
      setStatus("static");
      return;
    }

    const key = jsApiKey;
    let amapInstance: AMapMap | null = null;
    let disposed = false;

    async function renderMap() {
      setStatus("loading");

      try {
        const AMap = await loadAmap({ key, securityJsCode });

        if (!containerRef.current || disposed) {
          return;
        }

        amapInstance = new AMap.Map(containerRef.current, {
          center: map.center,
          zoom: 13,
          mapStyle: "amap://styles/whitesmoke",
          viewMode: "2D"
        });

        amapInstance.addControl(new AMap.Scale());
        amapInstance.addControl(new AMap.ToolBar());

        const markers = map.markers.map(
          (marker) =>
            new AMap.Marker({
              position: marker.position,
              title: marker.name,
              anchor: "center",
              content: markerContent(marker)
            })
        );
        const polyline = new AMap.Polyline({
          path: map.polyline,
          strokeColor: "#087f7a",
          strokeOpacity: 0.92,
          strokeWeight: 6,
          strokeStyle: "solid",
          lineJoin: "round"
        });
        const overlays = [...markers, polyline];

        amapInstance.add(overlays);
        amapInstance.setFitView(overlays, false, [54, 54, 54, 54]);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }

    void renderMap();

    return () => {
      disposed = true;
      amapInstance?.destroy();
    };
  }, [canRenderAmap, jsApiKey, map.center, map.markers, map.polyline, securityJsCode]);

  return (
    <div className="route-map-shell">
      <div className="route-map-canvas" ref={containerRef}>
        {status !== "ready" ? <StaticRouteMap map={map} status={status} /> : null}
      </div>
      <div className="route-map-status">
        <Route size={15} />
        {status === "ready"
          ? "高德地图"
          : status === "loading"
            ? "加载地图"
            : status === "error"
              ? "静态预览"
              : "静态预览"}
      </div>
    </div>
  );
}

function StaticRouteMap({ map, status }: { map: RouteMapView; status: string }) {
  const projected = projectMapView(map);
  const points = projected?.path.map((point) => `${point.x},${point.y}`).join(" ") ?? "";

  return (
    <div className="static-route-map">
      {projected && points ? (
        <svg preserveAspectRatio="none" viewBox="0 0 100 96">
          <polyline
            fill="none"
            points={points}
            stroke="#087f7a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.16}
            strokeWidth={5}
          />
          <polyline
            fill="none"
            points={points}
            stroke="#087f7a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.95}
            strokeWidth={1.9}
          />
        </svg>
      ) : null}
      {projected ? (
        <div className="static-map-marker-layer">
          {projected.markers.map((marker) => {
            const imageUrl = safeImageUrl(marker.imageUrl);

            return (
              <span
                className="static-detail-marker-wrap"
                key={marker.id}
                style={{
                  left: `${marker.projected.x}%`,
                  top: `${marker.projected.y}%`
                }}
              >
                <span
                  className={[
                    "static-map-marker",
                    marker.kind === "origin" ? "origin" : "tone-teal",
                    marker.featured ? "featured" : "",
                    imageUrl ? "with-image" : "",
                    "selected"
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {imageUrl && marker.kind === "stop" ? (
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
                  <span>{marker.label}</span>
                </span>
                {marker.kind === "stop" ? <em>{marker.name}</em> : null}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="static-route-copy">
        <MapPinned size={22} />
        <strong>{status === "loading" ? "地图加载中" : "路线预览"}</strong>
        <p>{map.markers.length > 0 ? `${map.markers.length} 个点位已定位` : "暂无可用坐标"}</p>
      </div>
    </div>
  );
}
