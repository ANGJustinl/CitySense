"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinned, Route } from "lucide-react";
import type { RouteMapView } from "@/server/routes/route-detail";
import { loadAmap, type AMapMap } from "@/components/city/amap-loader";

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
              label: {
                content: String(marker.index),
                direction: "top"
              }
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
  return (
    <div className="static-route-map">
      <div className="static-route-line" />
      {map.markers.slice(0, 5).map((marker, index) => (
        <span className={`static-route-pin pin-${index + 1}`} key={marker.id}>
          {marker.index}
        </span>
      ))}
      <div className="static-route-copy">
        <MapPinned size={22} />
        <strong>{status === "loading" ? "地图加载中" : "路线预览"}</strong>
        <p>{map.markers.length > 0 ? `${map.markers.length} 个地点已定位` : "暂无可用坐标"}</p>
      </div>
    </div>
  );
}
