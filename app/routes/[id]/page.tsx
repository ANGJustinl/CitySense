import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Gauge,
  MapPin,
  MapPinned,
  RadioTower
} from "lucide-react";
import { getRouteDetail } from "@/server/routes/route-detail";
import { RouteDetailMap } from "@/components/city/RouteDetailMap";
import { PreviewableImage } from "@/components/city/ImagePreview";
import { TrafficBadge } from "@/components/city/TrafficBadge";
import {
  buildRouteChoiceSummary,
  buildRouteJourneyItems,
  buildRoutePersona
} from "@/components/city/route-display";

export default async function RouteDetail({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRouteDetail(id);

  if (!detail) {
    return (
      <main className="route-detail-shell">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} />
          返回工作台
        </Link>
        <section className="route-empty-state">
          <MapPinned size={28} />
          <p className="eyebrow">Route detail</p>
          <h1>路线不存在</h1>
          <p>当前路线 id 没有匹配到推荐快照。请回到工作台重新生成路线。</p>
        </section>
      </main>
    );
  }

  const { route, map, recommendation } = detail;
  const summary = buildRouteChoiceSummary(route);
  const persona = buildRoutePersona(route);
  const journeyItems = buildRouteJourneyItems(route);

  return (
    <main className="route-detail-shell">
      <header className="route-detail-topbar">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} />
          返回工作台
        </Link>
        <span>Recommendation {recommendation.id.slice(0, 8)}</span>
      </header>

      <section className="route-detail-grid">
        <div className="route-detail-map-panel">
          <RouteDetailMap map={map} />
        </div>

        <aside className="route-detail-side">
          <div className="route-detail-heading">
            <p className="eyebrow">Route detail</p>
            <h1>{route.title}</h1>
            <p>{summary.endpointLabel}</p>
          </div>

          <div className={`route-detail-persona theme-${persona.themeKey}`}>
            {persona.representativePlace.imageUrl ? (
              <PreviewableImage
                alt={persona.representativePlace.name}
                className="route-detail-persona-image"
                loading="lazy"
                src={persona.representativePlace.imageUrl}
              />
            ) : (
              <span>{persona.themeName.slice(0, 1)}</span>
            )}
            <div>
              <strong>{persona.themeName}</strong>
              <p>{persona.featureText}</p>
              <div className="route-story-tags">
                {persona.tags.length > 0 ? (
                  persona.tags.map((tag) => <span key={tag}>{tag}</span>)
                ) : (
                  <span>城市探索</span>
                )}
              </div>
            </div>
          </div>

          <div className="route-detail-metrics">
            <span>
              <Clock3 size={15} />
              {summary.durationLabel}
            </span>
            <span>
              <MapPin size={15} />
              {summary.stopCountLabel}
            </span>
            <span>
              <Gauge size={15} />
              {summary.scoreLabel}
            </span>
            <TrafficBadge traffic={route.traffic} />
          </div>

          <div className="route-detail-section compact">
            <h2>路线亮点</h2>
            <p>{route.reason}</p>
          </div>

          <div className="route-journey-list">
            {journeyItems.map((item) => (
              <div
                className={
                  item.id === persona.representativePlace.id
                    ? `route-journey-row ${item.type} featured`
                    : `route-journey-row ${item.type}`
                }
                key={item.id}
              >
                <span>{item.label}</span>
                <div>
                  {"legLabel" in item && item.legLabel ? <em>{item.legLabel}</em> : null}
                  <strong>{item.title}</strong>
                  {"address" in item ? <p>{item.address}</p> : null}
                  {"tags" in item && item.tags.length > 0 ? (
                    <div className="tag-row">
                      {item.tags.slice(0, 4).map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="route-detail-section">
            <h2>来源信号</h2>
            <div className="route-signal-list">
              {route.sourceSignals.length > 0 ? (
                route.sourceSignals.map((signal) => (
                  <div key={`${signal.source}-${signal.label}`}>
                    <RadioTower size={15} />
                    <span>{signal.label}</span>
                    <strong>{signal.score}</strong>
                  </div>
                ))
              ) : (
                <p className="pulse-empty">暂无来源信号</p>
              )}
            </div>
          </div>

          <div className="route-detail-section">
            <h2>出行建议</h2>
            {route.tips.length > 0 ? (
              route.tips.map((tip) => <p key={tip}>{tip}</p>)
            ) : (
              <p className="pulse-empty">暂无额外建议</p>
            )}
          </div>

          <a className="text-link" href={`/api/routes/${route.id}`}>
            查看 API 响应
            <ExternalLink size={14} />
          </a>
        </aside>
      </section>
    </main>
  );
}
