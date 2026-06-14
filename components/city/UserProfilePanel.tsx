"use client";

import { useEffect, useState } from "react";
import { Sparkles, Trash2, UserCircle2 } from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";

/**
 * 用户画像面板（AI 助手分支组件，适配 main 的 user-profile API）。
 * main 的 API 用 ?userId=&view=summary，返回 { summary: { topPositiveTags, ... } }。
 */

type ProfileSummary = {
  hasProfile: boolean;
  degraded: boolean;
  summary: {
    sampleSize: number;
    confidence: string;
    topPositiveTags: { tag: string; weight: number }[];
  } | null;
};

type UserProfilePanelProps = {
  response: RecommendResponse;
  profileKey?: string;
};

function formatTag(tag: string, weight: number) {
  const sign = weight >= 0 ? "+" : "";
  return `${tag} ${sign}${weight.toFixed(1)}`;
}

export function UserProfilePanel({ response, profileKey }: UserProfilePanelProps) {
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!profileKey) {
      return;
    }

    let cancelled = false;

    fetch(`/api/user-profile?userId=${encodeURIComponent(profileKey)}&view=summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileSummary | null) => {
        if (!cancelled && data) {
          setSummary(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileKey, response.meta.recommendationId]);

  const hasProfile = summary?.hasProfile && summary.summary;
  const topTags = hasProfile ? summary!.summary!.topPositiveTags : [];

  async function handleClear() {
    if (!profileKey || clearing) {
      return;
    }

    setClearing(true);

    try {
      const res = await fetch(
        `/api/user-profile?userId=${encodeURIComponent(profileKey)}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setCleared(true);
        setSummary(null);
      }
    } catch {
      // 清空失败保持原样,不阻塞界面。
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="pulse-stack profile-stack">
      <div className="section-heading">
        <UserCircle2 size={18} />
        <span>用户画像</span>
      </div>

      {!hasProfile ? (
        <p className="pulse-empty">
          还没有画像数据。多给路线一些反馈(有帮助 / 不合适 / 收藏),系统会更懂你。
        </p>
      ) : (
        <>
          <div className="pulse-list">
            <div>
              <Sparkles size={17} />
              <span>置信度</span>
              <strong>{summary!.summary!.confidence}</strong>
            </div>
            <div>
              <span>样本量</span>
              <strong>{summary!.summary!.sampleSize}</strong>
            </div>
          </div>

          {topTags.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title">
                <span>偏好因子</span>
              </div>
              <div className="pulse-token-row positive">
                {topTags.slice(0, 6).map((factor) => (
                  <span key={factor.tag}>
                    {formatTag(factor.tag, factor.weight)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {profileKey ? (
        <button
          type="button"
          className="profile-clear-btn"
          onClick={handleClear}
          disabled={clearing || cleared}
        >
          <Trash2 size={14} />
          {cleared ? "已清空" : clearing ? "清空中…" : "清空画像"}
        </button>
      ) : null}

      {!profileKey ? (
        <p className="profile-hint">登录或保持会话后,画像将随反馈自动积累。</p>
      ) : null}
    </div>
  );
}
