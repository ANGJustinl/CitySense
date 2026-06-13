"use client";

import {
  Clock3,
  Footprints,
  MapPin,
  Navigation,
  Waypoints
} from "lucide-react";
import type {
  RecommendedRoute,
  RouteLeg,
  TravelMode
} from "@/server/recommendation/types";
import { PlaceThumb } from "@/components/city/VenueCard";

const modeIcon: Record<TravelMode, typeof Footprints> = {
  walking: Footprints,
  transit: Waypoints,
  driving: Navigation
};

const modeLabel: Record<TravelMode, string> = {
  walking: "步行",
  transit: "公交",
  driving: "驾车"
};

const congestionLabel: Record<string, string> = {
  smooth: "畅通",
  moderate: "缓行",
  busy: "拥堵"
};

function LegConnector({
  leg,
  fallbackMode,
  fallbackCongestion
}: {
  leg?: RouteLeg;
  fallbackMode: TravelMode;
  fallbackCongestion?: string;
}) {
  const mode = leg?.mode ?? fallbackMode;
  const congestion = leg?.congestion ?? fallbackCongestion;
  const ModeIcon = modeIcon[mode];

  return (
    <div className={`timeline-connector ${congestion ?? "unknown"}`}>
      <ModeIcon size={14} />
      <span>
        {leg
          ? `${leg.provider === "estimated" ? "约 " : ""}${leg.durationMinutes} min`
          : modeLabel[mode]}
      </span>
      {leg?.transitLines?.[0] ? <em>{leg.transitLines[0]}</em> : null}
    </div>
  );
}

export function RouteTimeline({ route }: { route?: RecommendedRoute }) {
  if (!route || route.places.length === 0) {
    return null;
  }

  const legs = route.legs ?? [];
  const hasLegs = legs.length > 0;
  const originName = legs[0]?.fromName ?? "出发点";
  const congestion = route.traffic.congestion
    ? congestionLabel[route.traffic.congestion] ?? route.traffic.congestion
    : undefined;

  function legForPlace(placeId: string, index: number) {
    return legs.find((leg) => leg.toPlaceId === placeId) ?? legs[index];
  }

  return (
    <section className="route-timeline" aria-label="route timeline">
      <div className="timeline-head">
        <strong>行程顺序</strong>
        <span className={`timeline-traffic ${route.traffic.congestion ?? "unknown"}`}>
          <Clock3 size={14} />
          全程约 {route.traffic.estimatedDurationMinutes} min
          <em>
            {route.traffic.provider}
            {congestion ? ` · ${congestion}` : ""}
          </em>
        </span>
      </div>

      <div className="timeline-track">
        {hasLegs ? (
          <div className="timeline-cell">
            <div className="timeline-stop origin">
              <span className="timeline-stop-index">起</span>
              <div className="timeline-stop-copy">
                <strong>{originName}</strong>
              </div>
            </div>
          </div>
        ) : null}
        {route.places.map((place, index) => (
          <div className="timeline-cell" key={place.id}>
            {index > 0 || hasLegs ? (
              <LegConnector
                fallbackCongestion={route.traffic.congestion}
                fallbackMode={route.traffic.mode}
                leg={legForPlace(place.id, index)}
              />
            ) : null}
            <div className="timeline-stop">
              <span className="timeline-stop-index">{index + 1}</span>
              <PlaceThumb imageUrl={place.imageUrl} name={place.name} size="timeline" />
              <div className="timeline-stop-copy">
                <strong>{place.name}</strong>
                <p>
                  <MapPin size={12} />
                  {place.address ?? "地址待确认"}
                </p>
                {place.tags.length > 0 ? (
                  <div className="timeline-tags">
                    {place.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
