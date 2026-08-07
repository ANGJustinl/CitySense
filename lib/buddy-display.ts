import type { BuddyHubTab } from "@/lib/buddy-navigation";
import type { BuddyRouteView } from "@/server/buddy/types";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正在招募",
  MATCHED: "已经同路",
  PENDING: "等待回应",
  ACCEPTED: "已经接受",
  REJECTED: "暂未同行",
  CANCELLED: "已经取消",
  COMPLETED: "行程完成",
  EXPIRED: "已经结束",
  LEFT: "已经退出",
  REMOVED: "已经离开",
};

const PACE_LABELS: Record<string, string> = {
  relaxed: "慢慢走",
  balanced: "自在逛",
  fast: "高效打卡",
};

export function buddyStatusLabel(value: string | null | undefined, context: "intent" | "group" | "application" = "intent") {
  if (!value) return "状态待确认";
  if (value.toUpperCase() === "ACTIVE" && context === "group") return "同行进行中";
  return STATUS_LABELS[value.toUpperCase()] ?? "状态已更新";
}

export function buddyPaceLabel(value: string | null | undefined) {
  if (!value) return undefined;
  return PACE_LABELS[value] ?? value;
}

export function buddyModeLabel(value: string | null | undefined) {
  return value === "AUTO" ? "自动匹配" : "公开组队";
}

export function buddyAvatarFallback(name: string | null | undefined) {
  return Array.from(name?.trim() ?? "")[0] ?? null;
}

export function summarizeBuddyStops(stops: BuddyRouteView["stops"], limit = 3) {
  const safeLimit = Math.max(1, limit);
  return {
    visible: stops.slice(0, safeLimit),
    remaining: Math.max(0, stops.length - safeLimit),
  };
}

export function buddyTabHref(input: { tab: BuddyHubTab; routeId?: string }) {
  const params = new URLSearchParams();
  if (input.routeId) params.set("routeId", input.routeId);
  if (input.tab !== "discover") params.set("tab", input.tab);
  const query = params.toString();
  return query ? `/buddy?${query}` : "/buddy";
}

export function buddyRouteMeta(route: BuddyRouteView) {
  return [route.city, route.area, route.durationMinutes > 0 ? `${route.durationMinutes} 分钟` : undefined, `${route.stops.length} 站`]
    .filter(Boolean)
    .join(" · ");
}
