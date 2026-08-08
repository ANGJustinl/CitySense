"use client";

import { useState } from "react";
import { BarChart3, CloudSun, Database, HeartPulse, RefreshCw, TimerReset, UsersRound } from "lucide-react";
import type { CityPulseResponse, PulseMetric } from "@/server/recommendation/city-pulse";
import { cityPulseAgeLabel, cityPulseMetricWidth } from "@/lib/city-pulse-display";

function conditionIcon(condition: string) {
  if (condition === "weather") return <CloudSun size={20} />;
  if (condition === "crowd") return <UsersRound size={20} />;
  if (condition === "sentiment") return <HeartPulse size={20} />;
  return <TimerReset size={20} />;
}

function MetricList({ title, items }: { title: string; items: PulseMetric[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="about-metric-card">
      <header><BarChart3 size={18} /><h3>{title}</h3></header>
      {items.length ? items.slice(0, 6).map((item) => (
        <div className="about-metric-row" key={item.label}>
          <span>{item.label}</span><i><b style={{ width: `${cityPulseMetricWidth(item.value, max)}%` }} /></i><strong>{item.value}</strong>
        </div>
      )) : <p className="product-empty">此刻还没有足够信号。</p>}
    </section>
  );
}

export function CityPulseOverview({ initialCity, initialPulse }: { initialCity: string; initialPulse: CityPulseResponse }) {
  const [city, setCity] = useState(initialCity);
  const [pulse, setPulse] = useState(initialPulse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function changeCity(nextCity: string) {
    if (nextCity === city || loading) return;
    const previousCity = city;
    setCity(nextCity);
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/city-pulse?city=${encodeURIComponent(nextCity)}`);
      if (!response.ok) throw new Error("城市现场读取失败");
      setPulse(await response.json());
    } catch {
      setCity(previousCity);
      setError("城市信号暂时没有回应，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="about-pulse">
      <div className="about-pulse-toolbar">
        <div><span>正在感知</span><strong>{city}</strong></div>
        <div role="group" aria-label="选择城市">
          {["北京", "上海"].map((option) => (
            <button aria-pressed={city === option} className={city === option ? "active" : ""} disabled={loading} key={option} onClick={() => void changeCity(option)} type="button">{option}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="about-pulse-loading"><RefreshCw className="spin" size={16} />正在刷新城市现场…</p> : null}
      {error ? <p className="product-error" role="alert">{error}</p> : null}
      <div className="about-condition-grid">
        {pulse.conditions.map((condition) => (
          <article className={condition.expired ? "expired" : ""} key={condition.condition}>
            {conditionIcon(condition.condition)}
            <span>{condition.source}</span>
            <strong>{condition.label}</strong>
            <small>{cityPulseAgeLabel(condition.ageMinutes)} · 可信度 {Math.round(condition.confidence * 100)}%</small>
          </article>
        ))}
        {!pulse.conditions.length ? <p className="product-empty">暂无城市状态快照。</p> : null}
      </div>
      <div className="about-metric-grid">
        <MetricList items={pulse.topTags} title="城里正在流行" />
        <MetricList items={pulse.sourceMix} title="信号从哪里来" />
      </div>
      <footer className="about-pulse-foot">
        <span><Database size={15} />{pulse.trafficCache.snapshotCount} 个交通快照</span>
        <span><TimerReset size={15} />更新于 {new Date(pulse.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
      </footer>
    </div>
  );
}
