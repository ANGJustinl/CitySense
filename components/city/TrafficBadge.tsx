import { Footprints, Navigation, Waypoints } from "lucide-react";
import type { TrafficInfo } from "@/server/recommendation/types";

const iconByMode = {
  walking: Footprints,
  transit: Waypoints,
  driving: Navigation
};

export function TrafficBadge({ traffic }: { traffic: TrafficInfo }) {
  const Icon = iconByMode[traffic.mode];

  return (
    <span className={`traffic-badge ${traffic.congestion ?? "unknown"}`}>
      <Icon size={15} />
      {traffic.mode}
    </span>
  );
}
