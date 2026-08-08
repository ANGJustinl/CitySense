"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Clock3, Footprints, Info, Loader2, MapPin, Navigation, RadioTower, ShieldCheck, Sparkles } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { PreviewableImage } from "@/components/city/ImagePreview";
import { buildRouteChoiceSummary, buildRouteJourneyItems, buildRoutePersona, formatDistance } from "@/components/city/route-display";
import { getRouteWeatherImpact } from "@/components/city/weather-impact";

type RouteInspectorProps = {
  routes: RecommendedRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  isLoading?: boolean;
};

const modeLabels = { walking: "步行", transit: "公共交通", driving: "驾车" } as const;

function freshnessLabel(value?: number) {
  if (value === undefined) return "时间未知";
  if (value <= 0) return "刚刚更新";
  return `${value} 分钟前`;
}

export function RouteInspector({ routes, selectedRouteId, onSelectRoute, isLoading }: RouteInspectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];

  useEffect(() => {
    const scroller = scrollRef.current?.closest<HTMLElement>(".commercial-route-panel-scroll, .route-commercial-scroll");
    scroller?.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedRoute?.id]);

  if (isLoading && routes.length === 0) {
    return <div className="route-inspector-state"><Loader2 className="spin" size={22} /><strong>正在为今晚编排行程</strong><p>召回地点、核对交通，再把值得去的放在一起。</p></div>;
  }
  if (!selectedRoute) {
    return <div className="route-inspector-state"><MapPin size={22} /><strong>还没有合适路线</strong><p>换一个区域、时间或兴趣再试试。</p></div>;
  }

  const persona = buildRoutePersona(selectedRoute);
  const summary = buildRouteChoiceSummary(selectedRoute);
  const weather = getRouteWeatherImpact(selectedRoute);
  const journey = buildRouteJourneyItems(selectedRoute);
  const distance = formatDistance(selectedRoute.traffic.distanceMeters);

  return (
    <div className="commercial-route-inspector" ref={scrollRef}>
      <div aria-label="可选路线" className="commercial-route-switcher" role="listbox">
        {routes.map((route, index) => {
          const routeSummary = buildRouteChoiceSummary(route);
          const routePersona = buildRoutePersona(route);
          const active = route.id === selectedRoute.id;
          return <button aria-selected={active} className={active ? "active" : ""} key={route.id} onClick={() => onSelectRoute(route.id)} role="option" type="button"><span>0{index + 1}</span><strong>{routePersona.themeName}</strong><small>{routeSummary.durationLabel}</small></button>;
        })}
      </div>

      <article className={`commercial-route-hero theme-${persona.themeKey}`}>
        {persona.representativePlace.imageUrl ? <PreviewableImage alt={persona.representativePlace.name} className="commercial-route-hero-image" loading="eager" src={persona.representativePlace.imageUrl} /> : <span className="commercial-route-hero-fallback">{persona.representativePlace.name.slice(0, 1)}</span>}
        <div className="commercial-route-hero-shade" />
        <div className="commercial-route-hero-copy"><p>{persona.themeName}</p><h2>{selectedRoute.title}</h2><span>{persona.representativePlace.name} 领衔</span></div>
      </article>

      <section className="commercial-route-intro">
        <p>{selectedRoute.summary}</p>
        <div className="commercial-route-tags">{persona.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </section>

      <div aria-label="行程摘要" className="commercial-route-metrics">
        <div><Clock3 size={17} /><span>全程</span><strong>{summary.durationLabel}</strong></div>
        <div><MapPin size={17} /><span>站点</span><strong>{summary.stopCountLabel}</strong></div>
        <div><Navigation size={17} /><span>交通</span><strong>{modeLabels[selectedRoute.traffic.mode]}</strong></div>
        <div className={`weather-${weather.tone}`}><Sparkles size={17} /><span>天气</span><strong>{weather.title}</strong></div>
      </div>

      <section className="commercial-route-section commercial-route-journey">
        <header><p className="product-kicker">THE JOURNEY</p><h3>从第一站到最后一站</h3>{distance ? <span>{distance}</span> : null}</header>
        <div className="commercial-journey-list">
          {journey.map((item, index) => (
            <div className={`commercial-journey-row ${item.type}`} key={item.id}>
              <span className="commercial-journey-index">{item.type === "origin" ? "起" : String(index).padStart(2, "0")}</span>
              <div>{"legLabel" in item && item.legLabel ? <em>{item.legLabel}</em> : null}<strong>{item.title}</strong>{"address" in item && item.address ? <p>{item.address}</p> : null}{"tags" in item && item.tags.length ? <small>{item.tags.slice(0, 3).join(" · ")}</small> : null}</div>
            </div>
          ))}
        </div>
      </section>

      {selectedRoute.momentFit ? <section className="commercial-route-now"><Clock3 size={20} /><div><p className="product-kicker">WHY TONIGHT</p><h3>今晚为什么适合走</h3><p>{selectedRoute.momentFit.whyNow}</p><div>{selectedRoute.momentFit.facts.slice(0, 4).map((fact) => <span key={`${fact.label}-${fact.value}`}>{fact.label} · {fact.value}</span>)}</div></div></section> : null}

      <section className="commercial-route-section commercial-route-highlight"><p className="product-kicker">ROUTE NOTE</p><h3>这条路线值得在哪里</h3><p>{selectedRoute.reason}</p></section>

      <details className="commercial-route-disclosure">
        <summary><span><ShieldCheck size={17} /><strong>推荐依据</strong><small>来源、可信度与数据边界</small></span><ChevronDown size={18} /></summary>
        <div>
          <p className="commercial-algorithm-note"><Info size={15} />{selectedRoute.traffic.provider === "amap" ? "高德 ETA 已参与路线排序，优先保留此刻更容易到达的组合。" : "当前交通为估算结果，路线仍可浏览，出发前建议再次确认。"}</p>
          {selectedRoute.evidence?.placeChecks.length ? <div className="commercial-evidence-list">{selectedRoute.evidence.placeChecks.map((check) => <div key={check.placeId}><span>{check.label}</span><strong>{Math.round(check.confidence * 100)}%</strong><small>{check.source}</small></div>)}</div> : <p className="product-empty">这条路线暂无结构化可信证据。</p>}
          {selectedRoute.evidence?.sourceFreshness.length ? <div className="commercial-source-list">{selectedRoute.evidence.sourceFreshness.slice(0, 6).map((source) => <span key={`${source.source}-${source.label}`}><RadioTower size={13} />{source.label} · {freshnessLabel(source.ageMinutes)}</span>)}</div> : null}
          {selectedRoute.evidence?.caveats.map((caveat) => <p className="commercial-caveat" key={caveat}>{caveat}</p>)}
        </div>
      </details>

      <details className="commercial-route-disclosure">
        <summary><span><Footprints size={17} /><strong>出行建议</strong><small>出发前再看一眼</small></span><ChevronDown size={18} /></summary>
        <div className="commercial-tip-list">{selectedRoute.tips.length ? selectedRoute.tips.map((tip) => <p key={tip}>{tip}</p>) : <p className="product-empty">暂无额外建议。</p>}</div>
      </details>
    </div>
  );
}
