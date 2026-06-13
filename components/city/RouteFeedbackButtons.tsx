"use client";

import { useState } from "react";
import { Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";

export function RouteFeedbackButtons({
  routeId,
  recommendationId
}: {
  routeId: string;
  recommendationId?: string;
}) {
  const [feedbackState, setFeedbackState] = useState<"idle" | "saving" | "saved">("idle");

  async function sendFeedback(value: "up" | "down" | "save") {
    if (!recommendationId) {
      return;
    }

    setFeedbackState("saving");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          recommendationLogId: recommendationId,
          routeId,
          value
        })
      });

      if (!response.ok) {
        throw new Error("feedback failed");
      }

      setFeedbackState("saved");
    } catch {
      setFeedbackState("idle");
    }
  }

  return (
    <div className="feedback-row" aria-label="route feedback">
      <button
        disabled={feedbackState === "saving"}
        onClick={() => sendFeedback("up")}
        title="这条路线有帮助"
        type="button"
      >
        <ThumbsUp size={15} />
        有帮助
      </button>
      <button
        disabled={feedbackState === "saving"}
        onClick={() => sendFeedback("save")}
        title="收藏这条路线"
        type="button"
      >
        <Bookmark size={15} />
        收藏
      </button>
      <button
        disabled={feedbackState === "saving"}
        onClick={() => sendFeedback("down")}
        title="这条路线不合适"
        type="button"
      >
        <ThumbsDown size={15} />
        不合适
      </button>
      {feedbackState === "saved" ? <span>已记录</span> : null}
    </div>
  );
}
