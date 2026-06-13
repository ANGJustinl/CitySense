"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ChevronDown,
  Clock3,
  ExternalLink,
  MapPin,
  Sparkles,
  ThumbsDown,
  ThumbsUp
} from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { SourceSignalBadge } from "@/components/city/SourceSignalBadge";
import { TrafficBadge } from "@/components/city/TrafficBadge";
import { VenueCard } from "@/components/city/VenueCard";

export function RouteCard({
  route,
  recommendationId
}: {
  route: RecommendedRoute;
  recommendationId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
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
          routeId: route.id,
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
    <article className="route-card">
      <div className="route-card-main">
        <div>
          <div className="route-title-row">
            <h3>{route.title}</h3>
            <span className="route-score">{route.totalScore}</span>
          </div>
          <p>{route.reason}</p>
        </div>
        <button
          aria-expanded={expanded}
          className={expanded ? "icon-button active" : "icon-button"}
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? "收起路线详情" : "展开路线详情"}
          type="button"
        >
          <ChevronDown size={18} />
        </button>
      </div>

      <div className="route-meta">
        <TrafficBadge traffic={route.traffic} />
        <span>
          <Clock3 size={15} />
          {route.traffic.estimatedDurationMinutes} min
        </span>
        <span>
          <Sparkles size={15} />
          {route.sourceSignals.length} signals
        </span>
      </div>

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

      <div className="signal-row">
        {route.sourceSignals.map((signal) => (
          <SourceSignalBadge key={`${signal.source}-${signal.label}`} signal={signal} />
        ))}
      </div>

      {expanded ? (
        <div className="route-details">
          <div className="place-stack">
            {route.places.map((place) => (
              <VenueCard key={place.id} place={place} />
            ))}
          </div>

          <div className="tips-list">
            {route.tips.map((tip) => (
              <p key={tip}>{tip}</p>
            ))}
          </div>

          <Link className="text-link" href={`/routes/${route.id}`}>
            <MapPin size={15} />
            路线详情
            <ExternalLink size={14} />
          </Link>
        </div>
      ) : null}
    </article>
  );
}
