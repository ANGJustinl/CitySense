"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuddyApplicationView, BuddyGroupMemberView, BuddyIntentView, BuddyRouteView } from "@/server/buddy/types";

export type BuddyDashboardApplication = BuddyApplicationView & { intent: BuddyIntentView };
export type BuddyDashboardGroup = {
  id: string;
  status: string;
  routeSnapshotId: string;
  route: BuddyRouteView;
  departureStart: string;
  departureEnd: string;
  meetingLabel: string;
  members: BuddyGroupMemberView[];
};

type BuddyDashboardData = {
  intents: BuddyIntentView[];
  mine: BuddyIntentView[];
  applications: BuddyDashboardApplication[];
  groups: BuddyDashboardGroup[];
};

const emptyDashboard: BuddyDashboardData = { intents: [], mine: [], applications: [], groups: [] };

async function loadDashboard(routeId?: string, signal?: AbortSignal) {
  const response = await fetch(`/api/buddy/intents${routeId ? `?routeId=${encodeURIComponent(routeId)}` : ""}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 401 ? "请先登录" : "加载搭子失败");
  return response.json() as Promise<BuddyDashboardData>;
}

export function useBuddyIntents(routeId?: string) {
  const [data, setData] = useState<BuddyDashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await loadDashboard(routeId));
    } catch (value) {
      setError(value instanceof Error ? value.message : "加载搭子失败");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(routeId, controller.signal)
      .then((result) => { setData(result); setError(undefined); })
      .catch((value: unknown) => { if (!(value instanceof DOMException && value.name === "AbortError")) setError(value instanceof Error ? value.message : "加载搭子失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [routeId]);

  return { ...data, loading, error, refresh };
}
