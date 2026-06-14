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
import {
  buildRouteChoiceSummary,
  buildRoutePersona,
  formatDistance
} from "@/components/city/route-display";
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
  const selectedSummary = buildRouteChoiceSummary(selectedRoute);

  return (
    <div className="route-inspector">
      <div className="route-choice-list" role="listbox" aria-label="route choices">
        {routes.map((route, index) => {
          const summary = buildRouteChoiceSummary(route);
          const persona = buildRoutePersona(route);
          const active = route.id === selectedRoute.id;

          return (
            <button
              aria-selected={active}
              className={
                active
                  ? `route-choice-card tone-${routeToneAt(index)} active`
                  : `route-choice-card tone-${routeToneAt(index)}`
              }
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              role="option"
              type="button"
            >
              <span className="route-choice-stripe" />
              <span className="route-choice-top">
                <span>
                  路线 {index + 1}
                  {index === 0 ? <em>Top</em> : null}
                </span>
                <strong>{summary.durationLabel}</strong>
              </span>
              <span className="route-choice-theme">{persona.themeName}</span>
              <span className="route-choice-title">{route.title}</span>
              <span className="route-choice-endpoints">{summary.endpointLabel}</span>
              <span className="route-choice-tags">
                {persona.tags.length > 0 ? (
                  persona.tags.map((tag) => <span key={tag}>{tag}</span>)
                ) : (
                  <span>城市探索</span>
                )}
              </span>
              <span className="route-choice-meta">
                <span>
                  <MapPin size={13} />
                  {summary.stopCountLabel}
                </span>
                <span>
                  <RadioTower size={13} />
                  {summary.signalLabel}
                </span>
                <span className="route-choice-score">
                  <Gauge size={13} />
                  {summary.scoreLabel}
                </span>
              </span>
              <span className="route-choice-provider">{summary.providerLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="route-selected-detail">
        <div className="inspector-heading">
          <h3>{selectedRoute.title}</h3>
          <span className="route-score">
            <Gauge size={14} />
            {selectedRoute.totalScore}
          </span>
        </div>
        <p className="inspector-summary">{selectedRoute.summary}</p>

        <div className="route-decision-grid" aria-label="selected route summary">
          <div>
            <Clock3 size={15} />
            <span>全程</span>
            <strong>{selectedSummary.durationLabel}</strong>
          </div>
          <div>
            <Navigation size={15} />
            <span>距离</span>
            <strong>{distance ?? "待确认"}</strong>
          </div>
          <div>
            <MapPin size={15} />
            <span>站点</span>
            <strong>{selectedSummary.stopCountLabel}</strong>
          </div>
          <div>
            <Gauge size={15} />
            <span>推荐分</span>
            <strong>{selectedSummary.scoreLabel}</strong>
          </div>
        </div>

        <div className="route-meta">
          <TrafficBadge traffic={selectedRoute.traffic} />
          <span>
            <Sparkles size={15} />
            {selectedSummary.signalLabel}
          </span>
        </div>

        <p className={isAmap ? "rerank-note amap" : "rerank-note estimated"}>
          {isAmap ? <Waypoints size={14} /> : <Footprints size={14} />}
          {isAmap
            ? "高德实时 ETA 已计入排序分，可达性更优的路线被提升。"
            : "当前为估算交通（未启用高德实时 ETA），排序使用估算耗时。"}
        </p>

        <section className="inspector-section highlight route-highlight-section">
          <h4>路线亮点</h4>
          <p>{selectedRoute.reason}</p>
        </section>

        <section className="inspector-section route-stops-section">
          <h4>沿线站点</h4>
          <div className="place-stack">
            {selectedRoute.places.map((place, index) => (
              <div className="inspector-stop" key={place.id}>
                <span className="inspector-stop-index">{index + 1}</span>
                <VenueCard place={place} variant="compact" />
              </div>
            ))}
          </div>
        </section>

        <section className="inspector-section route-signals-section">
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
          <section className="inspector-section route-tips-section">
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
    </div>
  );
}
