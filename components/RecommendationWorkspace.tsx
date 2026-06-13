"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Gauge,
  LocateFixed,
  Loader2,
  MapPinned,
  Navigation,
  RefreshCw,
  Route,
  SlidersHorizontal
} from "lucide-react";
import type {
  Budget,
  Mood,
  RecommendResponse,
  TimeWindow
} from "@/server/recommendation/types";
import { CityPulsePanel } from "@/components/city/CityPulsePanel";
import { RouteCard } from "@/components/city/RouteCard";

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
  const [data, setData] = useState<RecommendResponse>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const topScore = useMemo(() => data.routes[0]?.totalScore ?? 0, [data.routes]);

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
          useSocialSignals: true
        })
      });

      if (!response.ok) {
        throw new Error("recommend failed");
      }

      setData((await response.json()) as RecommendResponse);
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

      <section className="workspace">
        <aside className="controls-panel" aria-label="recommendation controls">
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

        <section className="results-panel">
          <div className="results-head">
            <div>
              <p className="eyebrow">Recommendation engine</p>
              <h2>3 条可执行城市路线</h2>
            </div>
            <div className="score-meter">
              <Gauge size={18} />
              <span>{topScore}</span>
            </div>
          </div>

          <div className="metric-strip">
            <div>
              <Route size={17} />
              <span>{data.routes.length} routes</span>
            </div>
            <div>
              <Navigation size={17} />
              <span>{data.meta.trafficProvider}</span>
            </div>
            <div>
              <LocateFixed size={17} />
              <span>{data.meta.candidateCount} candidates</span>
            </div>
          </div>

          <div className="route-list">
            {data.routes.map((route) => (
              <RouteCard
                key={route.id}
                recommendationId={data.meta.recommendationId}
                route={route}
              />
            ))}
          </div>
        </section>

        <aside className="pulse-panel">
          <CityPulsePanel area={area || undefined} city={city} response={data} />
          <div className="mini-map" aria-label="route map preview">
            <div className="route-line" />
            <span className="map-pin one">
              <MapPinned size={16} />
            </span>
            <span className="map-pin two">
              <MapPinned size={16} />
            </span>
            <span className="map-pin three">
              <MapPinned size={16} />
            </span>
          </div>
        </aside>
      </section>
    </main>
  );
}
