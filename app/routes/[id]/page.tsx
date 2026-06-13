import Link from "next/link";
import { ArrowLeft, Clock3, ExternalLink, MapPinned, RadioTower, Sparkles } from "lucide-react";
import { getRouteDetail } from "@/server/routes/route-detail";
import { RouteDetailMap } from "@/components/city/RouteDetailMap";
import { TrafficBadge } from "@/components/city/TrafficBadge";

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
            <p>{route.reason}</p>
          </div>

          <div className="route-detail-metrics">
            <span>
              <Sparkles size={15} />
              {route.totalScore}
            </span>
            <span>
              <Clock3 size={15} />
              {route.traffic.estimatedDurationMinutes} min
            </span>
            <TrafficBadge traffic={route.traffic} />
          </div>

          <div className="route-stop-list">
            {route.places.map((place, index) => (
              <div className="route-stop-row" key={place.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{place.name}</strong>
                  <p>{place.address ?? "地址待确认"}</p>
                  <div className="tag-row">
                    {place.tags.slice(0, 4).map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="route-detail-section">
            <h2>来源信号</h2>
            <div className="route-signal-list">
              {route.sourceSignals.map((signal) => (
                <div key={`${signal.source}-${signal.label}`}>
                  <RadioTower size={15} />
                  <span>{signal.label}</span>
                  <strong>{signal.score}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="route-detail-section">
            <h2>出行建议</h2>
            {route.tips.map((tip) => (
              <p key={tip}>{tip}</p>
            ))}
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
