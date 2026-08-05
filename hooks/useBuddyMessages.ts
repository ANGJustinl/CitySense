"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useBuddyMessages(groupId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState<string>();
  const latestRef = useRef<string | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const suffix = latestRef.current ? `?after=${encodeURIComponent(latestRef.current)}` : "";
    try {
      const response = await fetch(`/api/buddy/groups/${groupId}/messages${suffix}`, { cache: "no-store" });
      if (!response.ok) throw new Error("消息同步失败");
      const data = await response.json();
      if (data.messages.length) {
        setMessages((current) => {
          const map = new Map(current.map((item) => [item.id, item]));
          data.messages.forEach((item: any) => map.set(item.id, item));
          return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        latestRef.current = data.messages.at(-1).createdAt;
      }
      setError(undefined);
    } catch (value) { setError(value instanceof Error ? value.message : "消息同步失败"); }
  }, [groupId]);
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 3000); return () => window.clearInterval(timer); }, [refresh]);
  async function send(body: string) {
    const clientMessageId = crypto.randomUUID();
    const response = await fetch(`/api/buddy/groups/${groupId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientMessageId, body }) });
    if (!response.ok) throw new Error("发送失败");
    const data = await response.json(); setMessages((current) => [...current, data.message]); latestRef.current = data.message.createdAt;
  }
  return { messages, error, send, refresh };
}
