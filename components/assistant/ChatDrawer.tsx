"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImagePlus, Loader2, Send, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { useChat, type ChatAttachment, type ChatContext } from "@/hooks/useChat";
import { ChatCards } from "@/components/assistant/ChatCards";
import {
  CHAT_IMAGE_ACCEPT,
  MAX_CHAT_IMAGES,
  uploadChatImage,
  validateChatImages
} from "@/components/assistant/chat-image-upload";

type ChatDrawerProps = {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
  context?: ChatContext;
};

type PendingAttachment = {
  key: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  attachment?: ChatAttachment;
  error?: string;
};

export function ChatDrawer({ open, onClose, sessionId, context }: ChatDrawerProps) {
  const { messages, streaming, error, send, stop, clear } = useChat({ sessionId, context });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 释放已选图片的本地预览 URL,避免内存泄漏。
  useEffect(() => () => pending.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [pending]);

  // 消息列表自动滚到底部。
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Escape 关闭。
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function handleSubmit(event?: KeyboardEvent<HTMLTextAreaElement>) {
    if (event && event.key !== "Enter" && event.key !== undefined) {
      return;
    }
    if (event && event.key === "Enter" && event.shiftKey) {
      return;
    }
    if (event) {
      event.preventDefault();
    }

    // 有图片在上传中时禁止发送,避免丢图。
    const uploading = pending.some((item) => item.status === "uploading");
    if (streaming || uploading) {
      return;
    }
    if (!input.trim() && pending.length === 0) {
      return;
    }

    const attachments = pending
      .filter((item): item is PendingAttachment & { attachment: ChatAttachment } => Boolean(item.attachment))
      .map((item) => item.attachment);

    send(input, attachments.length > 0 ? attachments : undefined);
    setInput("");
    // 清空并释放本地预览。
    pending.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPending([]);
  }

  async function handleSelectFiles(selected: File[]) {
    const result = validateChatImages(selected, pending.length);
    if (result.errors.length > 0) {
      // 错误以首张失败图的状态展示,不入列。
      window.setTimeout(() => window.alert(result.errors.join("\n")), 0);
    }
    for (const file of result.valid) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);
      const entry: PendingAttachment = { key, file, previewUrl, status: "uploading" };
      setPending((current) => [...current, entry]);
      try {
        const uploaded = await uploadChatImage(file);
        setPending((current) =>
          current.map((item) =>
            item.key === key
              ? { ...item, status: "done", attachment: { id: uploaded.id, url: uploaded.url } }
              : item
          )
        );
      } catch (err) {
        setPending((current) =>
          current.map((item) =>
            item.key === key
              ? { ...item, status: "error", error: err instanceof Error ? err.message : "上传失败" }
              : item
          )
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

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="chat-backdrop" onClick={onClose} />
      <aside className="chat-drawer" role="dialog" aria-label="AI 助手">
        <header className="chat-header">
          <div className="chat-header-title">
            <Sparkles size={18} />
            <span>城市探索助手</span>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="chat-header-btn"
              onClick={clear}
              aria-label="清空对话"
              disabled={messages.length === 0}
              title="清空对话"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className="chat-header-btn"
              onClick={onClose}
              aria-label="关闭"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="chat-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <Sparkles size={32} />
              <p>你好!我是城市探索助手 🌆</p>
              <p>问我“今晚三里屯有什么好玩的”、“最近流行什么”,或者粘贴一段点评让我帮你判断值不值得去。</p>
              <div className="chat-suggestions">
                <button type="button" onClick={() => send("帮我提交一个小众地点，我还想上传现场照片")}>分享小众地点并上传照片</button>
                <button type="button" onClick={() => send("今晚三里屯有什么好玩的?")}>
                  今晚三里屯有什么好玩的?
                </button>
                <button type="button" onClick={() => send("五道营最近流行什么?")}>
                  五道营最近流行什么?
                </button>
                <button type="button" onClick={() => send("帮我推荐一条适合约会的路线")}>
                  帮我推荐一条适合约会的路线
                </button>
                <button type="button" onClick={() => send("今天天气怎么样?适合出去玩吗?")}>
                  今天天气怎么样?
                </button>
                <button type="button" onClick={() => send("最近有什么展览或活动?")}>
                  最近有什么展览?
                </button>
                <button type="button" onClick={() => send("帮我规划周末两天的行程")}>
                  帮我规划两天行程
                </button>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`chat-bubble-wrap ${message.role}`}>
                <div className={`chat-bubble ${message.role}`}>
                  {message.content || (message.role === "assistant" && streaming ? "…" : "")}
                  {message.attachments && message.attachments.length > 0 ? (
                    <div className="chat-bubble-images">
                      {message.attachments.map((attachment) => (
                        <img
                          key={attachment.id}
                          src={attachment.url}
                          alt="用户上传的图片"
                          className="chat-bubble-image"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
                {message.tools && message.tools.length > 0 ? (
                  <div className="chat-tools">
                    {message.tools.map((tool, index) => (
                      <div key={`${tool.name}-${index}`} className={`chat-tool-card ${tool.status}`}>
                        <Wrench size={13} />
                        <span>{tool.display}</span>
                        {tool.status === "running" ? (
                          <Loader2 size={12} className="chat-tool-spin" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {message.cards && message.cards.length > 0 ? (
                  <ChatCards cards={message.cards} />
                ) : null}
              </div>
            ))
          )}
        </div>

        {error ? <div className="chat-error">{error}</div> : null}

        <div className="chat-input-bar">
          {pending.length > 0 ? (
            <div className="chat-attach-previews" role="list" aria-label="待发送的图片">
              {pending.map((item) => (
                <div key={item.key} className={`chat-attach-preview ${item.status}`} role="listitem">
                  <img src={item.previewUrl} alt="待发送图片预览" />
                  {item.status === "uploading" ? (
                    <span className="chat-attach-overlay"><Loader2 size={14} className="chat-tool-spin" /></span>
                  ) : null}
                  {item.status === "error" ? (
                    <span className="chat-attach-overlay chat-attach-error" title={item.error}>!</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="移除图片"
                    className="chat-attach-remove"
                    onClick={() => removePending(item.key)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              accept={CHAT_IMAGE_ACCEPT}
              multiple
              capture="environment"
              className="chat-attach-input"
              disabled={streaming || pending.length >= MAX_CHAT_IMAGES}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) void handleSelectFiles(files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="chat-attach-btn"
              aria-label="添加图片"
              title="添加图片(可让助手看图分析)"
              disabled={streaming || pending.length >= MAX_CHAT_IMAGES}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={20} />
            </button>
            <textarea
              className="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleSubmit}
              placeholder={pending.length > 0 ? "说点什么,或直接发送图片…" : "输入你的问题…"}
              rows={1}
              disabled={streaming}
            />
            {streaming ? (
              <button type="button" className="chat-send stop" onClick={stop} aria-label="停止生成">
                <Loader2 size={16} className="chat-tool-spin" />
              </button>
            ) : (
              <button
                type="button"
                className="chat-send"
                onClick={() => handleSubmit()}
                disabled={(!input.trim() && pending.length === 0) || pending.some((item) => item.status === "uploading")}
                aria-label="发送"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
