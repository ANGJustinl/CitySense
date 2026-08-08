"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import type { ChatCard } from "@/hooks/useChat";
import { ChatPlaceUploadCard } from "@/components/assistant/ChatPlaceUploadCard";
import {
  CHAT_IMAGE_ACCEPT,
  MAX_CHAT_IMAGES,
  uploadChatImage,
  validateChatImages
} from "@/components/assistant/chat-image-upload";

type ActionCard = Extract<ChatCard, { kind: "action_pending" }>;

type PendingAttachment = {
  key: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  imageId?: string;
};

/** 支持在确认时附带图片的写操作。 */
const IMAGE_BACKED_TOOLS = new Set(["create_community_post", "submit_place"]);

export function ChatActionCard({ card }: { card: ActionCard }) {
  const [status, setStatus] = useState<"pending" | "busy" | "confirmed" | "cancelled" | "error">("pending");
  const [message, setMessage] = useState("");
  const [submissionId, setSubmissionId] = useState<string>();
  const supportsImages = IMAGE_BACKED_TOOLS.has(card.tool);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => pending.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [pending]);

  async function handleSelectFiles(selected: File[]) {
    const result = validateChatImages(selected, pending.length);
    if (result.errors.length > 0) {
      window.setTimeout(() => window.alert(result.errors.join("\n")), 0);
    }
    for (const file of result.valid) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);
      setPending((current) => [...current, { key, previewUrl, status: "uploading" }]);
      try {
        const uploaded = await uploadChatImage(file);
        setPending((current) =>
          current.map((item) => (item.key === key ? { ...item, status: "done", imageId: uploaded.id } : item))
        );
      } catch {
        setPending((current) =>
          current.map((item) => (item.key === key ? { ...item, status: "error" } : item))
        );
      }
    }
  }

  function removePending(key: string) {
    setPending((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }

  async function act(kind: "confirm" | "cancel") {
    setStatus("busy");
    try {
      // 仅在所有图片上传完成后才允许确认。
      const imageIds = pending
        .filter((item) => item.status === "done" && item.imageId)
        .map((item) => item.imageId as string);
      const response = await fetch(`/api/chat/actions/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: card.actionId, actionToken: card.actionToken, imageIds: imageIds.length > 0 ? imageIds : undefined })
      });
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

  const uploading = pending.some((item) => item.status === "uploading");

  return (
    <div className={`chat-action-card ${status}`}>
      <strong>{card.title}</strong>
      <p>{card.preview}</p>
      {/* 确认前可附图(post/submission)。已绑定图片的提交后动作不再显示。 */}
      {supportsImages && status === "pending" ? (
        <div className="chat-action-images">
          <input
            ref={fileInputRef}
            type="file"
            accept={CHAT_IMAGE_ACCEPT}
            multiple
            capture="environment"
            className="chat-attach-input"
            disabled={pending.length >= MAX_CHAT_IMAGES}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void handleSelectFiles(files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="chat-action-add-photo"
            disabled={pending.length >= MAX_CHAT_IMAGES}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={14} />
            {pending.length > 0 ? `已选 ${pending.length} 张` : "附照片"}
          </button>
          {pending.length > 0 ? (
            <div className="chat-attach-previews">
              {pending.map((item) => (
                <div key={item.key} className={`chat-attach-preview ${item.status}`}>
                  <img src={item.previewUrl} alt="待确认图片预览" />
                  {item.status === "uploading" ? (
                    <span className="chat-attach-overlay"><Loader2 size={14} className="chat-tool-spin" /></span>
                  ) : null}
                  {item.status === "error" ? <span className="chat-attach-overlay chat-attach-error">!</span> : null}
                  <button type="button" aria-label="移除图片" className="chat-attach-remove" onClick={() => removePending(item.key)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {status === "pending" ? (
        <div className="chat-action-buttons">
          <button onClick={() => void act("confirm")} type="button" disabled={uploading}>
            <Check size={14} />确认执行
          </button>
          <button onClick={() => void act("cancel")} type="button">
            <X size={14} />取消
          </button>
        </div>
      ) : null}
      {status === "busy" ? <span><Loader2 className="spin" size={14} />处理中</span> : null}
      {message ? <small>{message}</small> : null}
      {submissionId ? <ChatPlaceUploadCard submissionId={submissionId} /> : null}
      {status === "confirmed" && card.tool === "create_community_post" ? <Link href="/community">查看城市手记</Link> : null}
    </div>
  );
}
