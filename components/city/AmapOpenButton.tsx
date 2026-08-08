"use client";

import { Navigation } from "lucide-react";
import type { LngLat, RouteMapMarker } from "@/server/routes/route-detail";
import type { TravelMode } from "@/server/recommendation/types";

const modeParam: Record<TravelMode, string> = {
  walking: "walk",
  transit: "bus",
  driving: "car"
};

const modeLabel: Record<TravelMode, string> = {
  walking: "步行",
  transit: "公交",
  driving: "驾车"
};

type AmapOpenButtonProps = {
  markers: RouteMapMarker[];
  mode: TravelMode;
  routeTitle: string;
};

/**
 * 生成高德通用导航链接。
 * uri.amap.com/navigation 本身是 Universal Link：
 * - 手机浏览器打开会自动唤起高德 App（已安装时）
 * - 桌面 / 未装 App 时降级为高德网页版导航
 * callnative=1 用于在移动端尽量唤起原生 App。
 *
 * 高德 App 的 scheme 导航只支持单点导航 + 少量途经点，无法 1:1 复现
 * web 端这条 polyline 轨迹；这里把站点依次作为起点/终点/途经点传入，
 * App 会在收点后用自己的引擎重新规划路径。
 */
function buildAmapUrl(
  markers: RouteMapMarker[],
  mode: TravelMode,
  routeTitle: string
): string | null {
  const points = markers
    .filter((marker) => {
      const [lng, lat] = marker.position;

      return Number.isFinite(lng) && Number.isFinite(lat);
    })
    .map((marker) => {
      const [lng, lat] = marker.position;

      return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        name: marker.name
      };
    });

  if (points.length === 0) {
    return null;
  }

  // 第一个点作为起点，最后一个作为终点，中间最多 3 个途经点
  // （高德 App scheme 途经点上限，超出会被截断）。
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).slice(0, 3);

  const params = new URLSearchParams();
  params.set("source", "citysense");
  params.set("callnative", "1");
  params.set("mode", modeParam[mode]);
  params.set("coordinate", "gaode");
  params.set("src", "citysense");
  params.set("policy", mode === "transit" ? "1" : "0");

  const label = encodeURIComponent(routeTitle || origin.name);

  // to / from 不接受 URLSearchParams，手动拼接经纬度字符串。
  const fromStr = `${origin.lng},${origin.lat},${encodeURIComponent(origin.name)}`;
  const toStr = `${destination.lng},${destination.lat},${encodeURIComponent(destination.name)}`;

  let path = `https://uri.amap.com/navigation?from=${fromStr}&to=${toStr}`;

  if (waypoints.length > 0) {
    const viaStr = waypoints
      .map((point) => `${point.lng},${point.lat},${encodeURIComponent(point.name)}`)
      .join("|");
    path += `&via=${viaStr}`;
  }

  path += `&mode=${params.get("mode")}&coordinate=${params.get("coordinate")}&callnative=${params.get("callnative")}&src=${params.get("src")}&source=${params.get("source")}&policy=${params.get("policy")}&label=${label}`;

  return path;
}

export function AmapOpenButton({ markers, mode, routeTitle }: AmapOpenButtonProps) {
  const href = buildAmapUrl(markers, mode, routeTitle);

  if (!href) {
    return (
      <button
        className="amap-open-cta disabled"
        disabled
        title="本路线暂无可用坐标"
        type="button"
      >
        <Navigation size={17} />
        暂无坐标，无法导航
      </button>
    );
  }

  return (
    <a
      className="amap-open-cta"
      href={href}
      // 在新标签页打开：桌面是网页版导航，手机会触发 App 唤起。
      target="_blank"
      rel="noopener noreferrer"
      title={`用高德地图${modeLabel[mode]}导航打开这条路线`}
    >
      <Navigation size={17} />
      在高德地图 App 打开导航（{modeLabel[mode]}）
    </a>
  );
}
