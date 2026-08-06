"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import type { ChatCard } from "@/hooks/useChat";
import { ChatPlaceUploadCard } from "@/components/assistant/ChatPlaceUploadCard";

type ActionCard = Extract<ChatCard, { kind: "action_pending" }>;

export function ChatActionCard({ card }: { card: ActionCard }) {
  const [status, setStatus] = useState<"pending" | "busy" | "confirmed" | "cancelled" | "error">("pending");
  const [message, setMessage] = useState("");
  const [submissionId, setSubmissionId] = useState<string>();

  async function act(kind: "confirm" | "cancel") {
    setStatus("busy");
    try {
      const response = await fetch(`/api/chat/actions/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionId: card.actionId, actionToken: card.actionToken }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      setStatus(kind === "confirm" ? "confirmed" : "cancelled");
      setMessage(kind === "confirm" ? (data.result?.display ?? "操作已完成") : "已取消");
      if (kind === "confirm" && card.tool === "submit_place") {
        const text = String(data.result?.content ?? "");
        const match = text.match(/(?:创建|草稿已创建)[:：]?([a-zA-Z0-9_-]+)/);
        if (match?.[1]) setSubmissionId(match[1]);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "操作失败");
    }
  }

  return <div className={`chat-action-card ${status}`}>
    <strong>{card.title}</strong><p>{card.preview}</p>
    {status === "pending" ? <div><button onClick={() => void act("confirm")} type="button"><Check size={14} />确认执行</button><button onClick={() => void act("cancel")} type="button"><X size={14} />取消</button></div> : null}
    {status === "busy" ? <span><Loader2 className="spin" size={14} />处理中</span> : null}
    {message ? <small>{message}</small> : null}
    {submissionId ? <ChatPlaceUploadCard submissionId={submissionId} /> : null}
    {status === "confirmed" && card.tool === "create_community_post" ? <Link href="/community">查看城市手记</Link> : null}
  </div>;
}
