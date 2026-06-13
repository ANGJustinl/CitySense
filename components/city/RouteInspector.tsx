"use client";

import Link from "next/link";
import {
  Clock3,
  ExternalLink,
  Footprints,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  RadioTower,
  Sparkles,
  Waypoints
} from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { RouteFeedbackButtons } from "@/components/city/RouteFeedbackButtons";
import { routeToneAt } from "@/components/city/RouteMapCanvas";
import { SourceSignalBadge } from "@/components/city/SourceSignalBadge";
import { TrafficBadge } from "@/components/city/TrafficBadge";
import { VenueCard } from "@/components/city/VenueCard";

type RouteInspectorProps = {
  routes: RecommendedRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  recommendationId?: string;
  isLoading?: boolean;
};

function formatDistance(distanceMeters?: number) {
  if (!distanceMeters || distanceMeters <= 0) {
    return undefined;
  }

  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${Math.round(distanceMeters)} m`;
}

export function RouteInspector({
  routes,
  selectedRouteId,
  onSelectRoute,
  recommendationId,
  isLoading
}: RouteInspectorProps) {
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? routes[0];

  if (isLoading && routes.length === 0) {
    return (
      <div className="route-inspector">
        <div className="inspector-empty">
          <Loader2 className="spin" size={20} />
          <strong>路线生成中</strong>
          <p>正在召回候选、计算 ETA 并重排路线。</p>
        </div>
      </div>
    );
  }

  if (!selectedRoute) {
    return (
      <div className="route-inspector">
        <div className="inspector-empty">
          <MapPin size={20} />
          <strong>暂无可用路线</strong>
          <p>调整城市、区域或兴趣后重新生成路线。</p>
        </div>
      </div>
    );
  }

  const distance = formatDistance(selectedRoute.traffic.distanceMeters);
  const isAmap = selectedRoute.traffic.provider === "amap";

  return (
    <div className="route-inspector">
      <div className="inspector-tabs" role="tablist" aria-label="route switcher">
        {routes.map((route, index) => (
          <button
            aria-selected={route.id === selectedRoute.id}
            className={
              route.id === selectedRoute.id
                ? `inspector-tab tone-${routeToneAt(index)} active`
                : `inspector-tab tone-${routeToneAt(index)}`
            }
            key={route.id}
            onClick={() => onSelectRoute(route.id)}
            role="tab"
            type="button"
          >
            <i />
            <span>路线 {index + 1}</span>
            <strong>{route.totalScore}</strong>
          </button>
        ))}
      </div>

      <div className="inspector-heading">
        <h3>{selectedRoute.title}</h3>
        <span className="route-score">
          <Gauge size={14} />
          {selectedRoute.totalScore}
        </span>
      </div>
      <p className="inspector-summary">{selectedRoute.summary}</p>

      <div className="route-meta">
        <TrafficBadge traffic={selectedRoute.traffic} />
        <span>
          <Clock3 size={15} />
          {selectedRoute.traffic.estimatedDurationMinutes} min
        </span>
        {distance ? (
          <span>
            <Navigation size={15} />
            {distance}
          </span>
        ) : null}
        <span>
          <Sparkles size={15} />
          {selectedRoute.sourceSignals.length} signals
        </span>
      </div>

      <p className={isAmap ? "rerank-note amap" : "rerank-note estimated"}>
        {isAmap ? <Waypoints size={14} /> : <Footprints size={14} />}
        {isAmap
          ? "高德实时 ETA 已计入排序分，可达性更优的路线被提升。"
          : "当前为估算交通（未启用高德实时 ETA），排序使用估算耗时。"}
      </p>

      <section className="inspector-section">
        <h4>AI 解释</h4>
        <p>{selectedRoute.reason}</p>
      </section>

      <section className="inspector-section">
        <h4>沿线站点</h4>
        <div className="place-stack">
          {selectedRoute.places.map((place, index) => (
            <div className="inspector-stop" key={place.id}>
              <span className="inspector-stop-index">{index + 1}</span>
              <VenueCard place={place} />
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h4>
          <RadioTower size={14} />
          来源信号
        </h4>
        <div className="signal-row">
          {selectedRoute.sourceSignals.length > 0 ? (
            selectedRoute.sourceSignals.map((signal) => (
              <SourceSignalBadge key={`${signal.source}-${signal.label}`} signal={signal} />
            ))
          ) : (
            <span className="pulse-empty">暂无来源信号</span>
          )}
        </div>
      </section>

      {selectedRoute.tips.length > 0 ? (
        <section className="inspector-section">
          <h4>出行建议</h4>
          <div className="tips-list">
            {selectedRoute.tips.map((tip) => (
              <p key={tip}>{tip}</p>
            ))}
          </div>
        </section>
      ) : null}

      <RouteFeedbackButtons
        key={selectedRoute.id}
        recommendationId={recommendationId}
        routeId={selectedRoute.id}
      />

      <Link className="text-link" href={`/routes/${selectedRoute.id}`}>
        <MapPin size={15} />
        路线详情
        <ExternalLink size={14} />
      </Link>
    </div>
  );
}
