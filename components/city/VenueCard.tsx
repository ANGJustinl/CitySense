import { MapPin } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";

type Place = RecommendedRoute["places"][number];

export function VenueCard({ place }: { place: Place }) {
  return (
    <div className="place-row">
      <div>
        <strong>{place.name}</strong>
        <span>{place.type}</span>
      </div>
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
