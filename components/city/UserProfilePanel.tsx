"use client";

import { useEffect, useState } from "react";
import { Sparkles, Trash2, UserCircle2 } from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";
import type { UserProfileMeta } from "@/server/recommendation/profile.types";

type ProfileApiResponse = {
  profileKey: string;
  stale: boolean;
  profile: UserProfileMeta;
};

type UserProfilePanelProps = {
  response: RecommendResponse;
  profileKey?: string;
};

const SOURCE_LABELS: Record<UserProfileMeta["source"], string> = {
  profile: "已学习画像",
  fallback: "即时反馈",
  empty: "暂无画像"
};

function formatFactor(factor: { dimension: string; key: string; weight: number }) {
  const sign = factor.weight >= 0 ? "+" : "";
  return `${factor.dimension}:${factor.key} ${sign}${factor.weight}`;
}

type ProfileFactorLite = { dimension: string; key: string; weight: number };

export function UserProfilePanel({ response, profileKey }: UserProfilePanelProps) {
  const inline = response.meta.userProfile;
  const [fetched, setFetched] = useState<ProfileApiResponse | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  // 优先用推荐响应内联的画像(meta.userProfile),避免每次推荐都额外请求;
  // 当有 profileKey 且响应无内联画像时,独立拉取一次。
  useEffect(() => {
    if (!profileKey || inline) {
      return;
    }

    let cancelled = false;

    fetch(`/api/user-profile?profileKey=${encodeURIComponent(profileKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileApiResponse | null) => {
        if (!cancelled && data) {
          setFetched(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetched(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileKey, response.meta.recommendationId, inline]);

  const meta: UserProfileMeta | undefined = inline ?? fetched?.profile;

  async function handleClear() {
    if (!profileKey || clearing) {
      return;
    }

    setClearing(true);

    try {
      const res = await fetch(`/api/user-profile?profileKey=${encodeURIComponent(profileKey)}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setCleared(true);
        setFetched(null);
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

      {!meta || meta.source === "empty" ? (
        <p className="pulse-empty">
          还没有画像数据。多给路线一些反馈(有帮助 / 不合适 / 收藏),系统会更懂你。
        </p>
      ) : (
        <>
          <div className="pulse-list">
            <div>
              <Sparkles size={17} />
              <span>来源</span>
              <strong>{SOURCE_LABELS[meta.source]}</strong>
            </div>
            <div>
              <span>样本</span>
              <strong>{meta.updatedFrom}</strong>
            </div>
            <div>
              <span>新鲜命中</span>
              <strong>{meta.recentExposureHits}</strong>
            </div>
          </div>

          {meta.topPositive.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title">
                <span>偏好因子</span>
              </div>
              <div className="pulse-token-row positive">
                {meta.topPositive.map((factor: ProfileFactorLite) => (
                  <span key={`${factor.dimension}:${factor.key}`}>
                    {formatFactor(factor)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {meta.topNegative.length > 0 ? (
            <section className="pulse-section">
              <div className="pulse-section-title">
                <span>反感因子</span>
              </div>
              <div className="pulse-token-row negative">
                {meta.topNegative.map((factor: ProfileFactorLite) => (
                  <span key={`${factor.dimension}:${factor.key}`}>
                    {formatFactor(factor)}
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
