"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Database,
  GitBranch,
  RadioTower,
  TimerReset,
  TrendingUp
} from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";
import type { CityPulseResponse, PulseMetric } from "@/server/recommendation/city-pulse";

type CityPulsePanelProps = {
  response: RecommendResponse;
  city: string;
  area?: string;
};

function increment(map: Map<string, number>, label: string | undefined, amount = 1) {
  if (!label) {
    return;
  }

  map.set(label, (map.get(label) ?? 0) + amount);
}

function topMetrics(map: Map<string, number>, limit: number): PulseMetric[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value: Math.round(value)
    }));
}

function formatTime(value?: string, mounted = true) {
  if (!value || !mounted) {
    return "未缓存";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function ageMinutes(value?: string, mounted = true) {
  if (!value || !mounted) {
    return undefined;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 60_000)) : undefined;
}

function formatAge(value?: number) {
  if (value === undefined) {
    return "无快照";
  }

  return value <= 0 ? "刚刚" : `${value}分钟前`;
}

function MetricBars({ metrics, empty }: { metrics: PulseMetric[]; empty: string }) {
  const max = Math.max(...metrics.map((metric) => metric.value), 1);

  if (metrics.length === 0) {
    return <p className="pulse-empty">{empty}</p>;
  }

  return (
    <div className="pulse-bars">
      {metrics.map((metric) => (
        <div className="pulse-bar" key={metric.label}>
          <div>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
          <i style={{ width: `${Math.max(8, (metric.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function CityPulsePanel({ response, city, area }: CityPulsePanelProps) {
  const [pulse, setPulse] = useState<CityPulseResponse | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const topRoute = response.routes[0];
  const signalCount = response.routes.reduce((sum, route) => sum + route.sourceSignals.length, 0);
  const trafficCapturedAt = response.routes
    .map((route) => route.traffic.capturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const cacheHits = response.routes.filter((route) => route.traffic.cacheHit).length;
  const derived = useMemo(() => {
    const tagCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();

    for (const route of response.routes) {
      for (const place of route.places) {
        for (const tag of place.tags) {
          increment(tagCounts, tag);
        }

        increment(sourceCounts, place.source ?? "database");
      }
    }

    return {
      topTags: topMetrics(tagCounts, 5),
      sourceMix: topMetrics(sourceCounts, 5)
    };
  }, [response.routes]);
  const recallChannels = response.meta.recallChannels ?? [];
  const topTags = pulse?.topTags.length ? pulse.topTags : derived.topTags;
  const sourceMix = pulse?.sourceMix.length ? pulse.sourceMix : derived.sourceMix;
  const trafficCache = pulse?.trafficCache;
  const trafficProviderMix = trafficCache?.providerMix ?? [];
  const trafficAge = trafficCache?.latestAgeMinutes ?? ageMinutes(trafficCapturedAt, mounted);

  useEffect(() => {
    const params = new URLSearchParams({
      city
    });

    if (area) {
      params.set("area", area);
    }

    let cancelled = false;

    fetch(`/api/city-pulse?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CityPulseResponse | null) => {
        if (!cancelled && data) {
          setPulse(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPulse(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [area, city, response.meta.recommendationId]);

  return (
    <div className="pulse-stack">
      <div className="city-image" />

      <div className="section-heading">
        <Activity size={18} />
        <span>城市信号</span>
      </div>

      <div className="pulse-list">
        <div>
          <RadioTower size={17} />
          <span>来源信号</span>
          <strong>{signalCount}</strong>
        </div>
        <div>
          <Database size={17} />
          <span>候选池</span>
          <strong>{response.meta.candidateCount}</strong>
        </div>
        <div>
          <TimerReset size={17} />
          <span>交通</span>
          <strong>{response.meta.trafficProvider}</strong>
        </div>
      </div>

      <section className="pulse-section">
        <div className="pulse-section-title">
          <TrendingUp size={16} />
          <span>热门标签</span>
        </div>
        <MetricBars empty="暂无标签信号" metrics={topTags} />
      </section>

      <section className="pulse-section">
        <div className="pulse-section-title">
          <BarChart3 size={16} />
          <span>来源占比</span>
        </div>
        <MetricBars empty="暂无来源信号" metrics={sourceMix} />
      </section>

      <section className="pulse-section">
        <div className="pulse-section-title">
          <GitBranch size={16} />
          <span>召回与反馈</span>
        </div>
        <div className="pulse-token-row">
          {recallChannels.length > 0 ? (
            recallChannels.map((channel) => <span key={channel}>{channel}</span>)
          ) : (
            <span>base</span>
          )}
        </div>
        <div className="pulse-mini-grid">
          <div>
            <span>Ranker</span>
            <strong>{response.meta.ranker ?? "weighted-v1"}</strong>
          </div>
          <div>
            <span>路线缓存</span>
            <strong>{cacheHits}/{response.routes.length}</strong>
          </div>
          <div>
            <span>快照</span>
            <strong>{trafficCache?.snapshotCount ?? 0}</strong>
          </div>
          <div>
            <span>新鲜度</span>
            <strong>{formatAge(trafficAge)}</strong>
          </div>
          <div>
            <span>刷新</span>
            <strong>{formatTime(trafficCache?.latestCapturedAt ?? trafficCapturedAt ?? pulse?.generatedAt, mounted)}</strong>
          </div>
        </div>
        {trafficProviderMix.length ? (
          <div className="pulse-token-row traffic">
            {trafficProviderMix.map((metric) => (
              <span key={metric.label}>{metric.label}: {metric.value}</span>
            ))}
            <span>{formatTime(trafficCache?.latestCapturedAt ?? trafficCapturedAt, mounted)}</span>
          </div>
        ) : null}
        {pulse?.feedbackTrend.length ? (
          <div className="pulse-token-row feedback">
            {pulse.feedbackTrend.map((metric) => (
              <span key={metric.label}>{metric.label}: {metric.value}</span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="pulse-copy">
        <strong>{topRoute?.title ?? "路线生成中"}</strong>
        <p>{topRoute?.summary ?? "等待推荐输入"}</p>
      </div>
    </div>
  );
}
