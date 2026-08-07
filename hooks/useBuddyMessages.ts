"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BuddyMessageClient = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender?: { buddyProfile?: { userId: string; displayName: string; avatarUrl: string | null; bio: string | null; city: string | null } | null } | null;
};

type MessageResponse = { messages: BuddyMessageClient[] };
type SendMessageResponse = { message: BuddyMessageClient };

export function useBuddyMessages(groupId: string, live = true) {
  const [messages, setMessages] = useState<BuddyMessageClient[]>([]);
  const [error, setError] = useState<string>();
  const latestRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const suffix = latestRef.current ? `?after=${encodeURIComponent(latestRef.current)}` : "";
    try {
      const response = await fetch(`/api/buddy/groups/${groupId}/messages${suffix}`, { cache: "no-store" });
      if (!response.ok) throw new Error("消息同步失败");
      const data = await response.json() as MessageResponse;
      if (data.messages.length) {
        setMessages((current) => {
          const map = new Map(current.map((item) => [item.id, item]));
          data.messages.forEach((item) => map.set(item.id, item));
          return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        const latest = data.messages.at(-1)?.createdAt;
        if (latest) latestRef.current = latest;
      }
      setError(undefined);
    } catch (value) {
      setError(value instanceof Error ? value.message : "消息同步失败");
    }
  }, [groupId]);

  useEffect(() => {
    void refresh();
    if (!live) return;
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  async function send(body: string) {
    const clientMessageId = crypto.randomUUID();
    const response = await fetch(`/api/buddy/groups/${groupId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientMessageId, body }) });
    if (!response.ok) throw new Error("发送失败");
    const data = await response.json() as SendMessageResponse;
    setMessages((current) => [...current, data.message]);
    latestRef.current = data.message.createdAt;
  }

  return { messages, error, send, refresh };
}
