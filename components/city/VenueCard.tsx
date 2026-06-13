"use client";

import { MapPin } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { PreviewableImage } from "@/components/city/ImagePreview";

type Place = RecommendedRoute["places"][number];

export function PlaceThumb({
  imageUrl,
  name,
  size
}: {
  imageUrl?: string;
  name: string;
  size: "card" | "timeline" | "compact";
}) {
  if (!imageUrl) {
    return null;
  }

  return (
    <PreviewableImage
      alt={name}
      className={
        size === "card"
          ? "place-thumb"
          : size === "compact"
            ? "compact-place-thumb"
            : "timeline-thumb"
      }
      loading="lazy"
      src={imageUrl}
      wrapperClassName={size === "compact" ? "compact-place-thumb-trigger" : undefined}
    />
  );
}

export function VenueCard({
  place,
  variant = "default"
}: {
  place: Place;
  variant?: "default" | "compact";
}) {
  const isCompact = variant === "compact";

  return (
    <div className={isCompact ? "place-row compact" : "place-row"}>
      <div>
        <strong>{place.name}</strong>
        <span>{place.type}</span>
      </div>
      {isCompact && !place.imageUrl ? (
        <span className="compact-place-thumb fallback">{place.name.slice(0, 1)}</span>
      ) : (
        <PlaceThumb
          imageUrl={place.imageUrl}
          name={place.name}
          size={isCompact ? "compact" : "card"}
        />
      )}
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
