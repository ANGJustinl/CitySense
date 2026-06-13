"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Gauge,
  GitBranch,
  Loader2,
  Navigation,
  RefreshCw,
  SlidersHorizontal,
  TimerReset,
  TriangleAlert
} from "lucide-react";
import type {
  Budget,
  Mood,
  RecommendResponse,
  TimeWindow
} from "@/server/recommendation/types";
import { CityPulsePanel } from "@/components/city/CityPulsePanel";
import { RouteInspector } from "@/components/city/RouteInspector";
import { RouteMapCanvas } from "@/components/city/RouteMapCanvas";
import { RouteTimeline } from "@/components/city/RouteTimeline";

type WorkspaceProps = {
  initialData: RecommendResponse;
};

const interestOptions = ["咖啡", "展览", "书店", "漫画", "独立音乐", "夜生活"];
const moodOptions: { value: Mood; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "quiet", label: "安静" },
  { value: "lively", label: "热闹" },
  { value: "date", label: "约会" },
  { value: "random", label: "随机" }
];
const timeOptions: { value: TimeWindow; label: string }[] = [
  { value: "now", label: "现在" },
  { value: "tonight", label: "今晚" },
  { value: "weekend", label: "周末" }
];
const budgetOptions: { value: Budget; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" }
];

export function RecommendationWorkspace({ initialData }: WorkspaceProps) {
  const [city, setCity] = useState("上海");
  const [area, setArea] = useState("");
  const [interests, setInterests] = useState(["咖啡", "展览", "书店", "漫画", "独立音乐"]);
  const [mood, setMood] = useState<Mood>("solo");
  const [budget, setBudget] = useState<Budget>("medium");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("tonight");
  const [useRealtimeTraffic, setUseRealtimeTraffic] = useState(false);
  const [waypointCount, setWaypointCount] = useState(3); // 途径点数量
  const [data, setData] = useState<RecommendResponse>(initialData);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(
    initialData.routes[0]?.id
  );
  const [isLoading, setIsLoading] = useState(false);

  // 全屏布局状态
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [metricsCollapsed, setMetricsCollapsed] = useState(false);

  const topScore = useMemo(() => data.routes[0]?.totalScore ?? 0, [data.routes]);
  const amapRouteCount = useMemo(
    () => data.routes.filter((route) => route.traffic.provider === "amap").length,
    [data.routes]
  );
  const cacheHitCount = useMemo(
    () => data.routes.filter((route) => route.traffic.cacheHit).length,
    [data.routes]
  );
  const selectedRoute =
    data.routes.find((route) => route.id === selectedRouteId) ?? data.routes[0];
  const isEstimatedTraffic = data.meta.trafficProvider === "estimated";

  async function submitRecommendation() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          city,
          area: area || undefined,
          origin: {
            lat: 31.224,
            lng: 121.459
          },
          interests,
          mood,
          budget,
          timeWindow,
          useRealtimeTraffic,
          useSocialSignals: true,
          waypointCount
        })
      });

      if (!response.ok) {
        throw new Error("recommend failed");
      }

      const nextData = (await response.json()) as RecommendResponse;

      setData(nextData);
      setSelectedRouteId(nextData.routes[0]?.id);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          <div>
            <p className="eyebrow">Project CitySense</p>
            <h1>城市脉搏</h1>
          </div>
        </div>
        <nav className="top-actions" aria-label="primary">
          <a href="/admin/sources">Sources</a>
          <a href="/discover">Discover</a>
        </nav>
      </header>

      <section className="workspace fullscreen-map">
        {/* 控制面板折叠按钮 */}
        <button
          className={`fullscreen-panel-toggle controls-toggle-left ${controlsCollapsed ? "collapsed" : ""}`}
          onClick={() => setControlsCollapsed(!controlsCollapsed)}
          title={controlsCollapsed ? "展开控制面板" : "折叠控制面板"}
          type="button"
        >
          {controlsCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        {/* 信息面板折叠按钮 */}
        <button
          className={`fullscreen-panel-toggle inspector-toggle-right ${inspectorCollapsed ? "collapsed" : ""}`}
          onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
          title={inspectorCollapsed ? "展开信息面板" : "折叠信息面板"}
          type="button"
        >
          {inspectorCollapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>

        {/* 状态栏折叠按钮 */}
        <button
          className="metrics-toggle-btn"
          onClick={() => setMetricsCollapsed(!metricsCollapsed)}
          title={metricsCollapsed ? "展开状态栏" : "收起状态栏"}
          type="button"
        >
          <ChevronDown size={16} style={{ transform: metricsCollapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }} />
        </button>

        <aside
          className={`controls-panel ${controlsCollapsed ? "collapsed" : ""}`}
          aria-label="recommendation controls"
        >
          <div className="section-heading">
            <SlidersHorizontal size={18} />
            <span>推荐输入</span>
          </div>

          <label className="field">
            <span>城市</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>

          <label className="field">
            <span>区域</span>
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="全城"
            />
          </label>

          <div className="field">
            <span>兴趣</span>
            <div className="chip-grid">
              {interestOptions.map((interest) => (
                <button
                  className={interests.includes(interest) ? "chip active" : "chip"}
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  type="button"
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>心情</span>
            <div className="segmented">
              {moodOptions.map((option) => (
                <button
                  className={mood === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setMood(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>时间</span>
            <div className="segmented">
              {timeOptions.map((option) => (
                <button
                  className={timeWindow === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setTimeWindow(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>预算</span>
            <div className="segmented">
              {budgetOptions.map((option) => (
                <button
                  className={budget === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setBudget(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>途径点数量</span>
            <div className="segmented">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  className={waypointCount === count ? "active" : ""}
                  key={count}
                  onClick={() => setWaypointCount(count)}
                  type="button"
                >
                  {count}点
                </button>
              ))}
            </div>
          </div>

          <label className="toggle-row">
            <input
              checked={useRealtimeTraffic}
              onChange={(event) => setUseRealtimeTraffic(event.target.checked)}
              type="checkbox"
            />
            <span>高德实时 ETA</span>
          </label>

          <button className="primary-button" disabled={isLoading} onClick={submitRecommendation} type="button">
            {isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            生成路线
          </button>
        </aside>

        <section className="map-stage" aria-label="route map workspace">
          <div className={`map-metrics ${metricsCollapsed ? "collapsed" : ""}`} aria-label="recommendation pipeline metrics">
            <div>
              <Database size={16} />
              <span>候选池</span>
              <strong>{data.meta.candidateCount}</strong>
            </div>
            <div className={isEstimatedTraffic ? "degraded" : ""}>
              {isEstimatedTraffic ? <TriangleAlert size={16} /> : <Navigation size={16} />}
              <span>高德 ETA</span>
              <strong>
                {isEstimatedTraffic ? "估算降级" : `${amapRouteCount}/${data.routes.length}`}
              </strong>
            </div>
            <div>
              <GitBranch size={16} />
              <span>交通重排</span>
              <strong>{data.meta.rankerVersion ?? data.meta.ranker ?? "weighted-v1"}</strong>
            </div>
            <div>
              <Gauge size={16} />
              <span>Top 路线分</span>
              <strong>{topScore}</strong>
            </div>
            <div>
              <TimerReset size={16} />
              <span>缓存命中</span>
              <strong>
                {cacheHitCount}/{data.routes.length || 0}
              </strong>
            </div>
          </div>

          <RouteMapCanvas
            isLoading={isLoading}
            onSelectRoute={setSelectedRouteId}
            routes={data.routes}
            selectedRouteId={selectedRoute?.id}
          />

          <RouteTimeline route={selectedRoute} />
        </section>

        <aside
          className={`inspector-rail ${inspectorCollapsed ? "collapsed" : ""}`}
          aria-label="route inspector"
        >
          <div className="inspector-panel">
            <RouteInspector
              isLoading={isLoading}
              onSelectRoute={setSelectedRouteId}
              recommendationId={data.meta.recommendationId}
              routes={data.routes}
              selectedRouteId={selectedRoute?.id}
            />
          </div>
          <div className="pulse-panel">
            <CityPulsePanel area={area || undefined} city={city} response={data} />
          </div>
        </aside>
      </section>
    </main>
  );
}
