"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles, Trash2, UserCircle2 } from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";

type Factor = { tag: string; weight: number; sampleSize?: number };
type ProfileSummary = {
  hasProfile: boolean;
  degraded: boolean;
  state: "empty" | "building" | "ready" | "reset" | "degraded";
  summary: {
    sampleSize: number;
    confidence: "low" | "medium" | "high";
    state: string;
    effectiveFrom: string | null;
    generatedAt: string;
    topPositiveTags: Factor[];
    topNegativeTags: Factor[];
    topSources: { source: string; weight: number }[];
    topAreas: { area: string; weight: number }[];
    budgetAffinity: number;
    quietnessAffinity: number;
    popularityAffinity: number;
    topReasons: string[];
  } | null;
};

type UserProfilePanelProps = {
  response: RecommendResponse;
  profileKey?: string;
  profileRevision?: number;
};

const confidenceLabel = { low: "建立中", medium: "较稳定", high: "稳定" } as const;

function formatTag(tag: string, weight: number) {
  return `${tag} ${weight >= 0 ? "+" : ""}${weight.toFixed(1)}`;
}

function affinityLabel(value: number, low: string, high: string) {
  if (value >= 60) return high;
  if (value <= 40) return low;
  return "均衡";
}

export function UserProfilePanel({ response, profileKey, profileRevision = 0 }: UserProfilePanelProps) {
  const [data, setData] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(profileKey));
  const [error, setError] = useState<string | undefined>();
  const [clearing, setClearing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!profileKey) return;
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/user-profile?userId=${encodeURIComponent(profileKey)}&view=summary`, {
        cache: "no-store"
      });
      if (!res.ok) throw new Error("画像读取失败");
      setData((await res.json()) as ProfileSummary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "画像读取失败");
    } finally {
      setLoading(false);
    }
  }, [profileKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile, profileRevision, response.meta.recommendationId]);

  async function handleClear() {
    if (!profileKey || clearing) return;
    const confirmed = window.confirm(
      "清空后，历史反馈仍保留用于审计，但不会再参与画像和推荐。此后的新反馈会建立一份新画像。"
    );
    if (!confirmed) return;
    setClearing(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/user-profile?userId=${encodeURIComponent(profileKey)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("画像清空失败");
      const result = (await res.json()) as { resetAt: string };
      setData({
        hasProfile: false,
        degraded: false,
        state: "reset",
        summary: {
          sampleSize: 0,
          confidence: "low",
          state: "reset",
          effectiveFrom: result.resetAt,
          generatedAt: result.resetAt,
          topPositiveTags: [],
          topNegativeTags: [],
          topSources: [],
          topAreas: [],
          budgetAffinity: 50,
          quietnessAffinity: 50,
          popularityAffinity: 50,
          topReasons: []
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "画像清空失败");
    } finally {
      setClearing(false);
    }
  }

  const summary = data?.summary;
  const state = data?.state;
  const profileFactors = response.meta.profileApplied?.topFactors ?? [];

  return (
    <div className="pulse-stack profile-stack">
      <div className="section-heading">
        <UserCircle2 size={18} />
        <span>用户画像</span>
      </div>

      {loading ? <p className="pulse-empty">画像加载中…</p> : null}
      {error ? (
        <div>
          <p className="profile-error" role="alert">{error}</p>
          <button className="profile-clear-btn" onClick={() => void loadProfile()} type="button">
            <RefreshCw size={14} />重试
          </button>
        </div>
      ) : null}

      {!loading && !error && (!summary || state === "empty" || state === "reset") ? (
        <p className="pulse-empty">
          {state === "reset"
            ? "画像已重置。新的反馈会从现在开始建立一份新画像。"
            : "还没有站内画像。给路线反馈或在画像页表态后，这里会即时更新。"}
        </p>
      ) : null}

      {!loading && !error && summary && summary.sampleSize > 0 ? (
        <>
          <div className="pulse-list">
            <div><Sparkles size={17} /><span>置信度</span><strong>{confidenceLabel[summary.confidence]}</strong></div>
            <div><span>有效信号</span><strong>{summary.sampleSize}</strong></div>
            <div><span>预算倾向</span><strong>{affinityLabel(summary.budgetAffinity, "偏低", "偏高")}</strong></div>
            <div><span>氛围</span><strong>{affinityLabel(summary.quietnessAffinity, "偏热闹", "偏安静")}</strong></div>
          </div>

          {summary.topPositiveTags.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title"><span>喜欢</span></div>
              <div className="pulse-token-row positive">
                {summary.topPositiveTags.map((factor) => <span key={factor.tag}>{formatTag(factor.tag, factor.weight)}</span>)}
              </div>
            </section>
          ) : null}

          {summary.topNegativeTags.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title"><span>不感兴趣</span></div>
              <div className="pulse-token-row negative">
                {summary.topNegativeTags.map((factor) => <span key={factor.tag}>{factor.tag} −{factor.weight.toFixed(1)}</span>)}
              </div>
            </section>
          ) : null}

          {summary.topAreas.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title"><span>常选区域</span></div>
              <div className="pulse-token-row positive">
                {summary.topAreas.map((factor) => <span key={factor.area}>{factor.area}</span>)}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {profileFactors.length > 0 ? (
        <section className="pulse-section">
          <div className="pulse-section-title"><span>本次推荐画像命中</span></div>
          <div className="pulse-token-row positive">
            {profileFactors.slice(0, 5).map((factor) => <span key={factor}>{factor}</span>)}
          </div>
        </section>
      ) : null}

      {profileKey ? (
        <div className="profile-panel-actions">
          <Link className="text-link" href={`/profile?userId=${encodeURIComponent(profileKey)}`}>完整画像</Link>
          <button type="button" className="profile-clear-btn" onClick={handleClear} disabled={clearing}>
            <Trash2 size={14} />{clearing ? "清空中…" : "清空画像"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
