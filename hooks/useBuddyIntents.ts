"use client";

import { useCallback, useEffect, useState } from "react";

export function useBuddyIntents(routeId?: string) {
  const [data, setData] = useState<{ intents: any[]; mine: any[]; applications: any[]; groups: any[] }>({ intents: [], mine: [], applications: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(`/api/buddy/intents${routeId ? `?routeId=${encodeURIComponent(routeId)}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "请先登录" : "加载搭子失败");
      setData(await response.json());
    } catch (value) { setError(value instanceof Error ? value.message : "加载搭子失败"); }
    finally { setLoading(false); }
  }, [routeId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...data, loading, error, refresh };
}
