import { Clock3, MapPin, Route as RouteIcon } from "lucide-react";
import type { ReactNode } from "react";
import { buddyRouteMeta, buddyStatusLabel, summarizeBuddyStops } from "@/lib/buddy-display";
import type { BuddyPublicProfileView, BuddyRouteView } from "@/server/buddy/types";
import { UserAvatar } from "@/components/UserAvatar";

export function BuddyAvatar({
  profile,
  name,
  size = "medium",
}: {
  profile?: BuddyPublicProfileView | null;
  name?: string | null;
  size?: "small" | "medium" | "large";
}) {
  const label = profile?.displayName ?? name ?? "CitySense 用户";
  return (
    <UserAvatar avatarUrl={profile?.avatarUrl} className={`buddy-editorial-avatar ${size}`} identity={profile?.userId ?? label} name={label} />
  );
}

export function BuddyStatus({ value, context = "intent" }: { value: string | null | undefined; context?: "intent" | "group" | "application" }) {
  return <span className="buddy-editorial-status" data-status={(value ?? "unknown").toLowerCase()}>{buddyStatusLabel(value, context)}</span>;
}

export function BuddyFolioHeader({
  index,
  eyebrow,
  title,
  copy,
  aside,
}: {
  index: string;
  eyebrow: string;
  title: string;
  copy?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="buddy-folio-header">
      <div className="buddy-folio-number" aria-hidden="true">{index}</div>
      <div>
        <p className="buddy-folio-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {copy ? <p>{copy}</p> : null}
      </div>
      {aside ? <aside>{aside}</aside> : null}
    </header>
  );
}

export function BuddyRouteLine({
  route,
  compact = false,
  maxStops,
}: {
  route: BuddyRouteView;
  compact?: boolean;
  maxStops?: number;
}) {
  const summary = summarizeBuddyStops(route.stops, maxStops ?? (compact ? 3 : 5));

  return (
    <div className={`buddy-route-line ${compact ? "compact" : ""}`}>
      <div className="buddy-route-line-heading">
        <span><RouteIcon aria-hidden="true" size={15} />路线档案</span>
        <small>{buddyRouteMeta(route)}</small>
      </div>
      <ol aria-label={`路线站点：${route.stops.map((stop) => stop.name).join("、")}`}>
        {summary.visible.map((stop, index) => (
          <li key={stop.id}>
            <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
            <span>{stop.name}</span>
          </li>
        ))}
        {summary.remaining > 0 ? <li className="more"><i aria-hidden="true">+</i><span>还有 {summary.remaining} 站</span></li> : null}
      </ol>
    </div>
  );
}

export function BuddyRouteFacts({ route, time, meeting }: { route: BuddyRouteView; time?: string; meeting?: string }) {
  return (
    <div className="buddy-route-facts">
      <span><MapPin aria-hidden="true" size={14} />{route.area ?? route.city}</span>
      {time ? <span><Clock3 aria-hidden="true" size={14} />{time}</span> : null}
      {meeting ? <span><MapPin aria-hidden="true" size={14} />{meeting}</span> : null}
    </div>
  );
}
