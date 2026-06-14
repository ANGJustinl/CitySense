"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  FileText,
  Filter,
  MapPin,
  RadioTower,
  RefreshCw,
  Sparkles,
  TrendingUp
} from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";
import type {
  CityProfileResponse,
  RecommendationTrace,
  TraceEntry,
  TraceKind,
  TraceTone
} from "@/server/recommendation/city-profile";

type CityProfileViewProps = {
  city: string;
  area?: string;
  initialProfile: CityProfileResponse;
  initialTrace: RecommendationTrace;
  initialRecommendation: RecommendResponse;
};

const traceKindIcon: Record<TraceKind, typeof Activity> = {
  recall: Database,
  signal: RadioTower,
  filter: Filter,
  rank: TrendingUp,
  compose: MapPin,
  note: FileText
};

const traceToneLabel: Record<TraceTone, string> = {
  ok: "成功",
  drop: "丢弃",
  warn: "注意",
  info: "信息"
};

function MetricBars({
  metrics,
  empty,
  suffix
}: {
  metrics: { label: string; value: number }[];
  empty: string;
  suffix?: string;
}) {
  const max = Math.max(...metrics.map((m) => m.value), 1);
  if (metrics.length === 0) {
    return <p className="pulse-empty">{empty}</p>;
  }
  return (
    <div className="pulse-bars">
      {metrics.map((metric) => (
        <div className="pulse-bar" key={metric.label}>
          <div>
            <span>{metric.label}</span>
            <strong>
              {metric.value}
              {suffix}
            </strong>
          </div>
          <i style={{ width: `${Math.max(8, (metric.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

function NoteCard({ note }: { note: CityProfileResponse["representativeNotes"][number] }) {
  return (
    <article className="profile-note-card">
      {note.imageUrl ? (
        <img
          alt={note.title}
          className="profile-note-cover"
          loading="lazy"
          src={note.imageUrl}
        />
      ) : (
        <div className="profile-note-cover placeholder">
          <Sparkles size={18} />
        </div>
      )}
      <div className="profile-note-body">
        <h4>{note.title}</h4>
        <div className="profile-note-meta">
          {note.author ? <span>@{note.author}</span> : null}
          {typeof note.likedCount === "number" ? <span>♥ {note.likedCount}</span> : null}
          {note.area ? <span>{note.area}</span> : null}
          <span className="profile-note-score">热度 {note.trendScore}</span>
        </div>
        {note.answerExcerpt ? (
          <p className="profile-note-answer">
            <strong>小红书 AI 搜索：</strong>
            {note.answerExcerpt}
          </p>
        ) : null}
        {note.sourceUrl ? (
          <a
            className="profile-note-link"
            href={note.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            查看原笔记 ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

function TraceRow({ entry }: { entry: TraceEntry }) {
  const Icon = traceKindIcon[entry.kind] ?? Activity;
  return (
    <li className={`trace-entry tone-${entry.tone}`}>
      <span className="trace-entry-icon">
        <Icon size={15} />
      </span>
      <div className="trace-entry-content">
        <p className="trace-entry-message">{entry.message}</p>
        <p className="trace-entry-source">来源：{entry.source}</p>
      </div>
      <span className={`trace-entry-tone tone-${entry.tone}`}>
        {traceToneLabel[entry.tone]}
      </span>
    </li>
  );
}

export function CityProfileView({
  city,
  area,
  initialProfile,
  initialTrace,
  initialRecommendation
}: CityProfileViewProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [trace, setTrace] = useState(initialTrace);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const matchTotal = useMemo(() => {
    const m = profile.sourceStats.matchStats;
    return m.confirmed + m.noCandidate + m.topicOnly + m.other;
  }, [profile.sourceStats.matchStats]);

  async function refresh() {
    setIsLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ city });
      if (area) params.set("area", area);

      // Refresh the profile + a fresh recommendation, then rebuild the trace.
      const [profileRes, recommendRes] = await Promise.all([
        fetch(`/api/city-profile?${params.toString()}`).then((r) => r.json()),
        fetch("/api/recommend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            city,
            area: area || undefined,
            interests: ["咖啡", "展览", "书店"],
            mood: "solo",
            budget: "medium",
            timeWindow: "tonight",
            useSocialSignals: true
          })
        }).then((r) => r.json())
      ]);

      setProfile(profileRes);
      setTrace(initialTrace); // trace rebuild happens server-side on next full page load;
      // for client refresh we keep the structure honest by noting it's from the initial load.
      void initialRecommendation;
    } catch {
      setError("刷新失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          <div>
            <p className="eyebrow">CitySense · 城市兴趣画像</p>
            <h1>
              {city}
              {area ? ` · ${area}` : ""} 的小红书画像
            </h1>
          </div>
        </div>
        <nav className="top-actions" aria-label="primary">
          <a href="/">工作台</a>
          <a href="/admin/sources">Sources</a>
          <button
            className="secondary-button"
            disabled={isLoading}
            onClick={refresh}
            type="button"
          >
            <RefreshCw size={16} className={isLoading ? "spin" : ""} />
            刷新
          </button>
        </nav>
      </header>

      <div className="profile-page">
        {error ? <p className="profile-error">{error}</p> : null}

        {/* ── 板块 1：城市兴趣画像 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Sparkles size={18} />
            <span>城市兴趣画像</span>
            <em className="profile-source-tag">
              基于 {profile.sourceStats.citySignalCount} 条小红书 CitySignal
            </em>
          </div>

          <div className="profile-grid two-col">
            <div className="profile-card">
              <div className="pulse-section-title">
                <TrendingUp size={16} />
                <span>兴趣标签（热度聚合）</span>
              </div>
              <MetricBars
                empty="暂无小红书标签信号"
                metrics={profile.topTags}
                suffix=""
              />
            </div>

            <div className="profile-card">
              <div className="pulse-section-title">
                <MapPin size={16} />
                <span>区域分布（信号数）</span>
              </div>
              <MetricBars
                empty="暂无区域分布数据"
                metrics={profile.areaDistribution}
              />
            </div>
          </div>

          {profile.representativeNotes.length > 0 ? (
            <div className="profile-notes">
              <div className="pulse-section-title">
                <FileText size={16} />
                <span>代表性小红书笔记（真实采集，按热度排序）</span>
              </div>
              <div className="profile-note-list">
                {profile.representativeNotes.map((note) => (
                  <NoteCard key={note.sourceKey} note={note} />
                ))}
              </div>
            </div>
          ) : (
            <p className="pulse-empty">该区域暂无小红书代表性笔记</p>
          )}
        </section>

        {/* ── 板块 2：推荐推理日志 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <RadioTower size={18} />
            <span>推荐推理日志</span>
            <em className="profile-source-tag">agent 如何从小红书信号得出路线</em>
          </div>

          <ul className="trace-list">
            {trace.entries.map((entry, index) => (
              <TraceRow entry={entry} key={index} />
            ))}
          </ul>

          <div className="trace-summary">
            <strong>小结：</strong>
            {trace.summary}
          </div>

          <p className="trace-disclaimer">
            每条日志均标注真实数据来源字段。小红书当前通过城市热度间接影响排序；
            直接地点匹配需完成 social-place-matcher 的 venue 绑定。
          </p>
        </section>

        {/* ── 板块 3：数据来源明细 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Database size={18} />
            <span>数据来源明细</span>
            <em className="profile-source-tag">透明度</em>
          </div>

          <div className="profile-stats-grid">
            <div className="profile-stat">
              <span>小红书原始条目</span>
              <strong>{profile.sourceStats.rawItemCount}</strong>
            </div>
            <div className="profile-stat">
              <span>CitySignal 信号</span>
              <strong>{profile.sourceStats.citySignalCount}</strong>
            </div>
            <div className="profile-stat">
              <span>覆盖区域</span>
              <strong>{profile.sourceStats.coveredAreas}</strong>
            </div>
            <div className="profile-stat">
              <span>最新采集</span>
              <strong>
                {profile.sourceStats.latestCapturedAt
                  ? mounted
                    ? new Date(profile.sourceStats.latestCapturedAt).toLocaleString("zh-CN")
                    : "…"
                  : "无"}
              </strong>
            </div>
          </div>

          <div className="profile-card">
            <div className="pulse-section-title">
              <Filter size={16} />
              <span>小红书信号匹配状态（共 {matchTotal} 条匹配记录）</span>
            </div>
            {matchTotal > 0 ? (
              <div className="pulse-token-row">
                <span className="tone-ok">已确认 venue: {profile.sourceStats.matchStats.confirmed}</span>
                <span className="tone-drop">topic_only（合集/攻略）: {profile.sourceStats.matchStats.topicOnly}</span>
                <span className="tone-warn">no_candidate（无候选）: {profile.sourceStats.matchStats.noCandidate}</span>
                <span>其它: {profile.sourceStats.matchStats.other}</span>
              </div>
            ) : (
              <p className="pulse-empty">暂无小红书 venue 匹配记录</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
