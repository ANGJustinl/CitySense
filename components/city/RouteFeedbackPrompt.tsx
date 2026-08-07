"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { FEEDBACK_REASONS, feedbackReasonsFor, type FeedbackReason } from "@/server/recommendation/feedback-reasons";

type FeedbackValue = "up" | "down";

export function RouteFeedbackPrompt({ routeId, recommendationId, userId, sessionId, onRecorded }: { routeId: string; recommendationId?: string; userId?: string; sessionId?: string; onRecorded?: () => void }) {
  const [pending, setPending] = useState<FeedbackValue>();
  const [selected, setSelected] = useState<FeedbackValue>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  async function send(value: FeedbackValue, reason?: FeedbackReason) {
    if (!recommendationId || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recommendationLogId: recommendationId, routeId, userId, sessionId, value, reason }) });
      if (!response.ok) throw new Error();
      setSelected(value); setPending(undefined); setMessage("收到，会让下一次推荐更懂你。"); onRecorded?.();
    } catch { setMessage("反馈暂时没有保存，请稍后重试。"); }
    finally { setSaving(false); }
  }

  return <section className="commercial-route-feedback"><div><span>这条推荐合适吗？</span><button aria-pressed={selected === "up"} onClick={() => setPending("up")} type="button"><ThumbsUp size={15} />有帮助</button><button aria-pressed={selected === "down"} onClick={() => setPending("down")} type="button"><ThumbsDown size={15} />不合适</button></div>{pending ? <div className="commercial-feedback-reasons"><span>可以告诉我们原因，也可以直接跳过。</span>{feedbackReasonsFor(pending).map((reason) => <button disabled={saving} key={reason} onClick={() => void send(pending, reason)} type="button">{FEEDBACK_REASONS[reason].label}</button>)}<button disabled={saving} onClick={() => void send(pending)} type="button">跳过原因</button></div> : null}{message ? <p aria-live="polite">{message}</p> : null}</section>;
}
