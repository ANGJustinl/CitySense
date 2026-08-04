"use client";

import { useState } from "react";
import { Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";

type FeedbackValue = "up" | "down" | "save";

type FeedbackResult = {
  ok: boolean;
  effectiveValue: FeedbackValue;
  profileRefreshed: boolean;
};

export function RouteFeedbackButtons({
  routeId,
  recommendationId,
  userId,
  sessionId,
  onRecorded
}: {
  routeId: string;
  recommendationId?: string;
  userId?: string;
  sessionId?: string;
  onRecorded?: (result: FeedbackResult) => void;
}) {
  const [selected, setSelected] = useState<FeedbackValue | undefined>();
  const [saving, setSaving] = useState<FeedbackValue | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function sendFeedback(value: FeedbackValue) {
    if (!recommendationId || saving) return;
    setSaving(value);
    setError(undefined);
    setMessage(undefined);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendationLogId: recommendationId,
          routeId,
          userId,
          sessionId,
          value
        })
      });
      const result = (await response.json().catch(() => ({}))) as FeedbackResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "反馈保存失败");
      setSelected(value);
      setMessage(result.profileRefreshed ? "已记录，画像已更新" : "反馈已记录，画像稍后更新");
      onRecorded?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "反馈保存失败，请重试");
    } finally {
      setSaving(undefined);
    }
  }

  const buttons: Array<{ value: FeedbackValue; label: string; title: string; Icon: typeof ThumbsUp }> = [
    { value: "up", label: "有帮助", title: "这条路线有帮助", Icon: ThumbsUp },
    { value: "save", label: "收藏", title: "收藏这条路线", Icon: Bookmark },
    { value: "down", label: "不合适", title: "这条路线不合适", Icon: ThumbsDown }
  ];

  return (
    <div>
      <div className="feedback-row" aria-label="route feedback">
        {buttons.map(({ value, label, title, Icon }) => (
          <button
            aria-pressed={selected === value}
            className={selected === value ? "active" : ""}
            disabled={Boolean(saving)}
            key={value}
            onClick={() => sendFeedback(value)}
            title={title}
            type="button"
          >
            <Icon size={15} />
            {saving === value ? "保存中…" : label}
          </button>
        ))}
        {message ? <span>{message}</span> : null}
      </div>
      {error ? <p className="profile-error" role="alert">{error}</p> : null}
    </div>
  );
}
