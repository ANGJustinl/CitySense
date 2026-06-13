"use client";

import { MapPin } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";

type Place = RecommendedRoute["places"][number];

export function PlaceThumb({
  imageUrl,
  name,
  size
}: {
  imageUrl?: string;
  name: string;
  size: "card" | "timeline";
}) {
  if (!imageUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 外部来源图片（高德/小红书 CDN）URL 任意且可能过期，next/image 优化器会代理请求并破坏 no-referrer 直链策略
    <img
      alt={name}
      className={size === "card" ? "place-thumb" : "timeline-thumb"}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      referrerPolicy="no-referrer"
      src={imageUrl}
    />
  );
}

export function VenueCard({ place }: { place: Place }) {
  return (
    <div className="place-row">
      <div>
        <strong>{place.name}</strong>
        <span>{place.type}</span>
      </div>
      <PlaceThumb imageUrl={place.imageUrl} name={place.name} size="card" />
      <p>
        <MapPin size={14} />
        {place.address ?? "地址待确认"}
      </p>
      <div className="tag-row">
        {place.tags.slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}
