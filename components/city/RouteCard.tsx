"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Clock3,
  ExternalLink,
  MapPin,
  Sparkles
} from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { RouteFeedbackButtons } from "@/components/city/RouteFeedbackButtons";
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

      <RouteFeedbackButtons recommendationId={recommendationId} routeId={route.id} />

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
