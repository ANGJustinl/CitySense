"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  Check,
  Heart,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  X
} from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import type { RecommendResponse } from "@/server/recommendation/types";
import type {
  RecommendationTrace,
  TraceEntry,
  TraceKind,
  TraceTone
} from "@/server/recommendation/city-profile";
import type {
  DimensionScore,
  TagAction,
  TagCandidate,
  UserProfileResponse
} from "@/server/recommendation/user-profile";

type UserProfileViewProps = {
  city: string;
  area?: string;
  initialProfile: UserProfileResponse;
  initialRecommendation: RecommendResponse;
  initialTrace: RecommendationTrace;
};

const sourceLabel: Record<TagCandidate["source"], string> = {
  explicit: "你已表态",
  implicit: "行为推断",
  city: "城市热度"
};

const statusLabel: Record<TagCandidate["status"], string> = {
  approved: "认可",
  disapproved: "不认可",
  pending: "待表态"
};

const traceKindIcon: Record<TraceKind, typeof Activity> = {
  recall: User,
  signal: Sparkles,
  filter: X,
  rank: Heart,
  compose: Activity,
  note: Sparkles
};

const traceToneLabel: Record<TraceTone, string> = {
  ok: "成功",
  drop: "丢弃",
  warn: "注意",
  info: "信息"
};

/**
 * Six-axis radar chart rendered as pure SVG (zero chart deps).
 * 6 vertices around a center, concentric hexagonal grid at 20/40/60/80/100.
 */
function RadarChart({ dimensions }: { dimensions: DimensionScore[] }) {
  const size = 360;
  const center = size / 2;
  const radius = 130;
  const levels = [20, 40, 60, 80, 100];
  const angleSlice = (Math.PI * 2) / dimensions.length;

  // Vertex coordinates for a given (axisIndex, value 0-100).
  function point(axisIndex: number, value: number) {
    const angle = axisIndex * angleSlice - Math.PI / 2; // start at top
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  }

  function labelPoint(axisIndex: number) {
    const angle = axisIndex * angleSlice - Math.PI / 2;
    const r = radius + 32;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  }

  // Grid hexagons (concentric).
  const gridPolygons = levels.map((level) =>
    dimensions
      .map((_, i) => {
        const p = point(i, level);
        return `${p.x},${p.y}`;
      })
      .join(" ")
  );

  // Data polygon.
  const dataPoints = dimensions.map((dim, i) => point(i, dim.value));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // Axis lines from center to each vertex.
  const axisLines = dimensions.map((_, i) => {
    const p = point(i, 100);
    return { x1: center, y1: center, x2: p.x, y2: p.y, key: i };
  });

  return (
    <div className="radar-chart-wrap">
      <svg
        aria-label="用户品味六维雷达图"
        className="radar-chart"
        role="img"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Concentric grid */}
        {gridPolygons.map((poly, i) => (
          <polygon
            className="radar-grid"
            key={`grid-${i}`}
            points={poly}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line) => (
          <line
            className="radar-axis"
            key={`axis-${line.key}`}
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
          />
        ))}

        {/* Data polygon */}
        <polygon
          className="radar-data"
          points={dataPolygon}
        />

        {/* Data vertices */}
        {dataPoints.map((p, i) => (
          <circle
            className="radar-vertex"
            cx={p.x}
            cy={p.y}
            key={`vertex-${i}`}
            r={4}
          >
            <title>
              {`${dimensions[i].label}: ${dimensions[i].value}${
                dimensions[i].topTags.length > 0
                  ? `\n相关: ${dimensions[i].topTags.join(", ")}`
                  : ""
              }`}
            </title>
          </circle>
        ))}

        {/* Axis labels */}
        {dimensions.map((dim, i) => {
          const lp = labelPoint(i);
          const isLeft = lp.x < center - 10;
          const isRight = lp.x > center + 10;
          const anchor = isLeft ? "end" : isRight ? "start" : "middle";
          return (
            <text
              className="radar-label"
              dominantBaseline="middle"
              key={`label-${dim.key}`}
              textAnchor={anchor}
              x={lp.x}
              y={lp.y}
            >
              {dim.label}
              <tspan
                className="radar-label-value"
                x={lp.x}
                y={lp.y + 16}
              >
                {dim.value}
              </tspan>
            </text>
          );
        })}
      </svg>

      {/* Dimension legend with top tags */}
      <div className="radar-legend">
        {dimensions.map((dim) => (
          <div
            className={`radar-legend-item ${dim.value > 60 ? "strong" : ""}`}
            key={dim.key}
          >
            <span className="radar-legend-label">
              {dim.label} <strong>{dim.value}</strong>
            </span>
            {dim.topTags.length > 0 ? (
              <span className="radar-legend-tags">{dim.topTags.join(" · ")}</span>
            ) : (
              <span className="radar-legend-tags muted">暂无相关标签</span>
            )}
          </div>
        ))}
      </div>
    </div>
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

function TagCard({
  candidate,
  disabled,
  onAction
}: {
  candidate: TagCandidate;
  disabled: boolean;
  onAction: (action: TagAction) => void;
}) {
  return (
    <article className={`tag-card status-${candidate.status}`}>
      <div className="tag-card-head">
        <h4 className="tag-card-name">{candidate.tag}</h4>
        <span className={`tag-card-source source-${candidate.source}`}>
          {sourceLabel[candidate.source]}
        </span>
      </div>
      <p className="tag-card-context">{candidate.context}</p>
      <div className="tag-card-actions">
        <button
          className={`tag-action approve ${candidate.status === "approved" ? "active" : ""}`}
          disabled={disabled}
          onClick={() => onAction("approve")}
          type="button"
        >
          <ThumbsUp size={14} />
          认可
        </button>
        <button
          className={`tag-action disapprove ${candidate.status === "disapproved" ? "active" : ""}`}
          disabled={disabled}
          onClick={() => onAction("disapprove")}
          type="button"
        >
          <ThumbsDown size={14} />
          不认可
        </button>
        <button
          className="tag-action skip"
          disabled={disabled}
          onClick={() => onAction("skip")}
          type="button"
        >
          跳过
        </button>
      </div>
    </article>
  );
}

export function UserProfileView({
  city,
  area,
  initialProfile,
  initialTrace
}: UserProfileViewProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const trace = initialTrace; // trace rebuild is server-side on next nav

  // 账号切换：更新 URL 的 userId 参数，触发服务端重新渲染画像 + 推荐。
  function handleAccountChange(nextUserId: string) {
    const params = new URLSearchParams();
    params.set("userId", nextUserId);
    if (city) params.set("city", city);
    if (area) params.set("area", area);
    // typedRoutes 对动态 query 校验严格，用 window.location 走标准导航。
    window.location.href = `/profile?${params.toString()}`;
  }

  const { pending, approved, disapproved } = useMemo(() => {
    const pending: TagCandidate[] = [];
    const approved: TagCandidate[] = [];
    const disapproved: TagCandidate[] = [];
    for (const c of profile.candidateTags) {
      if (c.status === "approved") approved.push(c);
      else if (c.status === "disapproved") disapproved.push(c);
      else pending.push(c);
    }
    return { pending, approved, disapproved };
  }, [profile.candidateTags]);

  const handleAction = useCallback(
    async (tag: string, action: TagAction) => {
      const actionKey = `${tag}:${action}`;
      setPendingAction(actionKey);
      setError(undefined);

      // Optimistic update: flip status locally before the server confirms.
      setProfile((current) => ({
        ...current,
        candidateTags: current.candidateTags.map((c) =>
          c.tag === tag
            ? {
                ...c,
                status: action === "approve" ? "approved" : action === "disapprove" ? "disapproved" : "pending",
                source: "explicit"
              }
            : c
        ),
        approvedTags:
          action === "approve"
            ? [...new Set([...current.approvedTags, tag])]
            : action === "disapprove"
              ? current.approvedTags.filter((t) => t !== tag)
              : current.approvedTags,
        disapprovedTags:
          action === "disapprove"
            ? [...new Set([...current.disapprovedTags, tag])]
            : action === "approve"
              ? current.disapprovedTags.filter((t) => t !== tag)
              : current.disapprovedTags
      }));

      try {
        const res = await fetch("/api/user-profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: profile.userId,
            tag,
            action,
            city,
            area
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "保存失败");
        }

        // 服务端返回重算后的完整画像（含 dimensions），用它替换本地状态，
        // 这样六维雷达图会随标签表态实时刷新。
        const refreshed = (await res.json()) as UserProfileResponse;
        if (refreshed && Array.isArray(refreshed.dimensions)) {
          setProfile(refreshed);
        }
      } catch (e) {
        // Rollback optimistic update on failure.
        setError(e instanceof Error ? e.message : "保存失败，已回滚");
        setProfile(initialProfile);
      } finally {
        setPendingAction(undefined);
      }
    },
    [initialProfile, profile.userId, city, area]
  );

  const stats = profile.stats;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <User size={20} />
          </span>
          <div>
            <p className="eyebrow">CitySense · 用户兴趣画像</p>
            <h1>{profile.userId} 的兴趣画像</h1>
          </div>
        </div>
        <nav className="top-actions" aria-label="primary">
          <AccountSwitcher currentUserId={profile.userId} onChange={handleAccountChange} />
          <a href={`/?userId=${profile.userId}`}>工作台</a>
          <a href="/admin/sources">Sources</a>
        </nav>
      </header>

      <div className="profile-page">
        {error ? <p className="profile-error">{error}</p> : null}

        {/* ── 板块 1：兴趣标签表态（核心交互） ── */}
        {/* ── 板块 0：六维品味雷达图 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Activity size={18} />
            <span>你的品味画像</span>
            <em className="profile-source-tag">
              基于认可标签 · 行为反馈 · 城市热度
            </em>
          </div>
          <RadarChart dimensions={profile.dimensions} />
        </section>

        {/* ── 板块 1：兴趣标签表态（核心交互） ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Sparkles size={18} />
            <span>告诉我你喜欢什么</span>
          </div>
          <p className="profile-intro">
            以下标签来自你在 {city}
            {area ? ` · ${area}` : ""} 的城市热度、历史反馈和已有表态。
            点击认可/不认可，推荐会越来越懂你。
          </p>

          {/* 待表态标签 */}
          {pending.length > 0 ? (
            <div className="tag-section">
              <div className="tag-section-title">
                <span>待表态（{pending.length}）</span>
              </div>
              <div className="tag-grid">
                {pending.map((candidate) => (
                  <TagCard
                    candidate={candidate}
                    disabled={pendingAction?.startsWith(candidate.tag) ?? false}
                    key={candidate.tag}
                    onAction={(action) => handleAction(candidate.tag, action)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="pulse-empty">暂无待表态标签 —— 你已对所有候选标签表态 🎉</p>
          )}

          {/* 已认可 */}
          {approved.length > 0 ? (
            <div className="tag-section">
              <div className="tag-section-title">
                <Check size={16} />
                <span>已认可（{approved.length}）</span>
              </div>
              <div className="tag-chips approved">
                {approved.map((c) => (
                  <button
                    className="chip approved"
                    disabled={pendingAction?.startsWith(c.tag)}
                    key={c.tag}
                    onClick={() => handleAction(c.tag, "disapprove")}
                    title="点击改为不认可"
                    type="button"
                  >
                    {c.tag} ✓
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* 不认可 */}
          {disapproved.length > 0 ? (
            <div className="tag-section">
              <div className="tag-section-title">
                <ThumbsDown size={16} />
                <span>不感兴趣（{disapproved.length}）</span>
              </div>
              <div className="tag-chips disapproved">
                {disapproved.map((c) => (
                  <button
                    className="chip disapproved"
                    disabled={pendingAction?.startsWith(c.tag)}
                    key={c.tag}
                    onClick={() => handleAction(c.tag, "approve")}
                    title="点击撤销，改为认可"
                    type="button"
                  >
                    <RotateCcw size={11} />
                    {c.tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* ── 板块 2：画像统计 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Activity size={18} />
            <span>画像概览</span>
          </div>
          <div className="profile-stats-grid">
            <div className="profile-stat accent">
              <span>已认可</span>
              <strong>{stats.approvedCount}</strong>
            </div>
            <div className="profile-stat">
              <span>不感兴趣</span>
              <strong>{stats.disapprovedCount}</strong>
            </div>
            <div className="profile-stat">
              <span>待表态</span>
              <strong>{stats.pendingCount}</strong>
            </div>
            <div className="profile-stat">
              <span>行为推断标签</span>
              <strong>{stats.implicitTagCount}</strong>
            </div>
          </div>
          <p className="profile-status-note">
            {stats.hasHistory
              ? "你的画像已基于历史反馈和行为建立。认可更多标签会让推荐更精准。"
              : "新用户：当前候选标签来自城市热度。表态后会逐步建立你的专属画像。"}
          </p>
        </section>

        {/* ── 板块 3：推荐推理日志 ── */}
        <section className="profile-section">
          <div className="section-heading">
            <Sparkles size={18} />
            <span>推荐推理日志</span>
            <em className="profile-source-tag">当前画像如何影响推荐</em>
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
        </section>
      </div>
    </main>
  );
}
