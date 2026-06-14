"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Send, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { useChat, type ChatContext } from "@/hooks/useChat";

type ChatDrawerProps = {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
  context?: ChatContext;
};

export function ChatDrawer({ open, onClose, sessionId, context }: ChatDrawerProps) {
  const { messages, streaming, error, send, stop, clear } = useChat({ sessionId, context });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

    if (!input.trim() || streaming) {
      return;
    }

    send(input);
    setInput("");
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
              <p>问我“今晚静安有什么好玩的”、“最近流行什么”,或者粘贴一段点评让我帮你判断值不值得去。</p>
              <div className="chat-suggestions">
                <button type="button" onClick={() => send("今晚静安有什么好玩的?")}>
                  今晚静安有什么好玩的?
                </button>
                <button type="button" onClick={() => send("黄浦最近流行什么?")}>
                  黄浦最近流行什么?
                </button>
                <button type="button" onClick={() => send("帮我推荐一条适合约会的路线")}>
                  帮我推荐一条适合约会的路线
                </button>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`chat-bubble-wrap ${message.role}`}>
                <div className={`chat-bubble ${message.role}`}>
                  {message.content || (message.role === "assistant" && streaming ? "…" : "")}
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
              </div>
            ))
          )}
        </div>

        {error ? <div className="chat-error">{error}</div> : null}

        <div className="chat-input-bar">
          <textarea
            className="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleSubmit}
            placeholder="输入你的问题…"
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
              disabled={!input.trim()}
              aria-label="发送"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
