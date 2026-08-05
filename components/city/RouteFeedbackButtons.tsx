"use client";

import { useState } from "react";
import { Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  FEEDBACK_REASONS,
  feedbackReasonsFor,
  type FeedbackReason
} from "@/server/recommendation/feedback-reasons";

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
  const [selected, setSelected] = useState<FeedbackValue>();
  const [pendingValue, setPendingValue] = useState<FeedbackValue>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function sendFeedback(value: FeedbackValue, reason?: FeedbackReason) {
    if (!recommendationId || saving) return;
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recommendationLogId: recommendationId, routeId, userId, sessionId, value, reason })
      });
      const result = (await response.json().catch(() => ({}))) as FeedbackResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "反馈保存失败");
      setSelected(value);
      setPendingValue(undefined);
      const reasonLabel = reason ? `“${FEEDBACK_REASONS[reason].label}”` : "这次反馈";
      setMessage(result.profileRefreshed
        ? `已记录${reasonLabel}，画像已更新，将用于下次生成路线`
        : "反馈已记录，画像稍后更新");
      onRecorded?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "反馈保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const buttons: Array<{ value: FeedbackValue; label: string; title: string; Icon: typeof ThumbsUp }> = [
    { value: "up", label: "有帮助", title: "这条路线有帮助", Icon: ThumbsUp },
    { value: "save", label: "收藏", title: "收藏这条路线", Icon: Bookmark },
    { value: "down", label: "不合适", title: "这条路线不合适", Icon: ThumbsDown }
  ];
  const reasons = pendingValue ? feedbackReasonsFor(pendingValue) : [];

  return (
    <div className="route-feedback-block">
      <div className="feedback-row" aria-label="route feedback">
        {buttons.map(({ value, label, title, Icon }) => (
          <button
            aria-pressed={selected === value || pendingValue === value}
            className={selected === value || pendingValue === value ? "active" : ""}
            disabled={saving}
            key={value}
            onClick={() => { setPendingValue(value); setMessage(undefined); setError(undefined); }}
            title={title}
            type="button"
          >
            <Icon size={15} />{label}
          </button>
        ))}
        {message ? <span>{message}</span> : null}
      </div>
      {pendingValue ? (
        <div className="feedback-reason-panel" aria-label="选择反馈原因">
          <span>是什么原因？</span>
          <div>
            {reasons.map((reason) => (
              <button disabled={saving} key={reason} onClick={() => void sendFeedback(pendingValue, reason)} type="button">
                {FEEDBACK_REASONS[reason].label}
              </button>
            ))}
            <button disabled={saving} onClick={() => void sendFeedback(pendingValue)} type="button">
              {saving ? "保存中…" : "跳过原因"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="profile-error" role="alert">{error}</p> : null}
    </div>
  );
}
