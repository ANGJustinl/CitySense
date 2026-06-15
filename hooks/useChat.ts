"use client";

/**
 * CitySense AI 助手 — 对话状态 + SSE 消费 hook。
 *
 * TASK-P2-004:纯 React hooks,无外部状态库(沿用项目模式)。
 * 通过 fetch + ReadableStream reader 消费 /api/chat 的 SSE 流。
 */

import { useCallback, useRef, useState } from "react";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** 工具调用展示(可选)。 */
  tools?: Array<{ name: string; display: string; status: "running" | "done" }>;
  /** 结构化卡片数据(路线/天气等,可选,供富文本渲染)。 */
  cards?: ChatCard[];
};

/** 富文本卡片类型。 */
export type ChatCard =
  | { kind: "route"; title: string; score: number; places: string[]; duration: number; reason: string; routeId?: string }
  | { kind: "weather"; city: string; phenomenon: string; temperature: string; forecast: Array<{ date: string; dayWeather: string; dayTemp: string }> }
  | { kind: "activity"; title: string; area?: string; tags: string[]; trendScore: number; startTime?: string };

export type ChatContext = {
  profileKey?: string;
  recommendationId?: string;
  city?: string;
  area?: string;
};

type UseChatOptions = {
  sessionId?: string;
  context?: ChatContext;
};

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useChat({ sessionId, context }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();

      if (!trimmed || streaming) {
        return;
      }

      const userMessage: ChatMessage = { id: makeId(), role: "user", content: trimmed };
      const assistantMessage: ChatMessage = { id: makeId(), role: "assistant", content: "", tools: [] };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setStreaming(true);
      setError(undefined);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: trimmed, context }),
          signal: abortController.signal
        });

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => "");
          throw new Error(`请求失败 (${response.status}): ${errText.slice(0, 100)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // 流式更新助手消息内容的 helper。
        const appendAssistant = (delta: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id ? { ...m, content: m.content + delta } : m
            )
          );
        };
        const updateAssistantTools = (updater: (tools: ChatMessage["tools"]) => ChatMessage["tools"]) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id ? { ...m, tools: updater(m.tools ?? []) } : m
            )
          );
        };

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // SSE 按双换行分割事件块。
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();

            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.slice(5).trim();

            try {
              const event = JSON.parse(data) as {
                type: string;
                content?: string;
                tool?: string;
                display?: string;
                message?: string;
                cards?: ChatCard[];
              };

              if (event.type === "delta" && event.content) {
                appendAssistant(event.content);
              } else if (event.type === "tool_start" && event.tool) {
                updateAssistantTools((tools = []) => [
                  ...tools,
                  { name: event.tool!, display: event.display ?? event.tool!, status: "running" }
                ]);
              } else if (event.type === "tool_end" && event.tool) {
                updateAssistantTools((tools = []) =>
                  tools.map((t) =>
                    t.name === event.tool ? { ...t, status: "done" as const, display: event.display ?? t.display } : t
                  )
                );
                // tool_end 可携带结构化卡片数据,附加到消息上供富文本渲染。
                if (event.cards && event.cards.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, cards: [...(m.cards ?? []), ...event.cards!] }
                        : m
                    )
                  );
                }
              } else if (event.type === "error" && event.message) {
                setError(event.message);
                appendAssistant(`\n\n⚠️ ${event.message}`);
              } else if (event.type === "done") {
                // 流结束。
              }
            } catch {
              // 单事件解析失败跳过。
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 用户主动中断,不报错。
        } else {
          const msg = err instanceof Error ? err.message : "对话失败";
          setError(msg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id && m.content === "" ? { ...m, content: `⚠️ ${msg}` } : m
            )
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, context, streaming]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(async () => {
    if (sessionId) {
      await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
    }
    setMessages([]);
    setError(undefined);
  }, [sessionId]);

  return { messages, streaming, error, send, stop, clear };
}
