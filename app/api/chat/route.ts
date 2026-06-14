/**
 * CitySense AI 助手 — 对话 SSE 端点。
 *
 * TASK-P2-004:POST /api/chat,流式返回助手回复。
 *
 * 链路:
 * 1. 读取 Redis 对话历史
 * 2. 拼 system prompt + history + 用户消息
 * 3. 流式请求 LLM,逐 delta 转发 SSE
 * 4. 遇到 tool_calls → 执行工具 → 结果追加 messages → 再次流式(最多 3 轮)
 * 5. 完成后持久化用户消息 + 助手回复到 Redis
 *
 * SSE 事件格式(每行 data: {...}\n\n):
 * - { type: "delta", content } — 助手回复增量
 * - { type: "tool_start", tool, display } — 工具调用开始
 * - { type: "tool_end", tool, display } — 工具调用完成
 * - { type: "done" } — 对话结束
 * - { type: "error", message } — 错误
 */

import { NextResponse } from "next/server";
import {
  createDefaultChatClient,
  CHAT_DEFAULT_TIMEOUT_MS,
  CHAT_MAX_TOOL_ROUNDS,
  type ChatMessage
} from "@/server/ai/chat-client";
import { CHAT_TOOLS, executeChatTool, TOOL_DISPLAY_NAMES } from "@/server/ai/chat-tools";
import { appendChatMessages, clearChatHistory, loadChatHistory } from "@/server/ai/chat-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `你是 CitySense 城市探索助手,帮助用户探索城市、分析推荐路线、解读城市信号。

核心规则:
- 你的回答必须基于工具返回的真实数据,绝不编造地点、活动、价格或评价。
- 用户问"有什么好玩的""今晚去哪"等探索性问题时,调用 recommend_routes 工具生成路线。
- 用户问"为什么推荐这条""这条路线怎样"时,若上下文有路线 id,调用 get_route_detail。
- 用户问"最近流行什么""这个区域有什么特点"时,调用 get_city_pulse。
- 用户问"你了解我吗""我的偏好"时,调用 get_user_profile。
- 用户粘贴外部内容(点评、笔记、链接)时,直接分析文本,提取地点/价格/氛围要点。
- 回答用中文,简洁友好,适当用 emoji 增加亲和力。
- 如果工具返回空结果或失败,如实告知用户,不要硬凑答案。`;

type ChatRequestBody = {
  sessionId?: string;
  message: string;
  context?: {
    profileKey?: string;
    recommendationId?: string;
    city?: string;
    area?: string;
  };
};

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: "message too long (max 2000 chars)" }, { status: 400 });
  }

  const client = createDefaultChatClient();

  // 降级:无 LLM key。
  if (!client) {
    return new Response(
      sseData({ type: "error", message: "AI 助手未配置(缺少 OPENAI_API_KEY),请联系管理员。" }) +
        sseData({ type: "done" }),
      {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      }
    );
  }

  const sessionId = body.sessionId;
  const context = {
    sessionId,
    profileKey: body.context?.profileKey ?? sessionId,
    recommendationId: body.context?.recommendationId,
    city: body.context?.city || "上海",
    area: body.context?.area
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), CHAT_DEFAULT_TIMEOUT_MS * (CHAT_MAX_TOOL_ROUNDS + 1));

      function send(payload: unknown) {
        controller.enqueue(encoder.encode(sseData(payload)));
      }

      try {
        // 1. 读取历史 + 构建消息序列。
        const history = await loadChatHistory(sessionId);
        const userMessage: ChatMessage = { role: "user", content: message };
        const messages: ChatMessage[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          userMessage
        ];

        let assistantContent = "";
        let toolRound = 0;

        // 2. 流式 + 工具调用循环。
        while (toolRound <= CHAT_MAX_TOOL_ROUNDS) {
          const events = client.streamChatCompletion({
            messages,
            tools: CHAT_TOOLS,
            signal: abortController.signal
          });

          let pendingToolCalls: ChatMessage["tool_calls"] | null = null;
          let roundContent = "";

          for await (const event of events) {
            if (event.type === "delta") {
              roundContent += event.content;
              assistantContent += event.content;
              send({ type: "delta", content: event.content });
            } else if (event.type === "tool_calls") {
              pendingToolCalls = event.calls;
            } else if (event.type === "done") {
              if (!pendingToolCalls) {
                // 无工具调用,对话结束。
                break;
              }
            } else if (event.type === "error") {
              send({ type: "error", message: event.message });
              break;
            }
          }

          // 3. 无工具调用或出错 → 结束。
          if (!pendingToolCalls || pendingToolCalls.length === 0) {
            break;
          }

          // 4. 执行工具调用。
          // 先把助手带 tool_calls 的消息加入序列。
          messages.push({
            role: "assistant",
            content: roundContent || null,
            tool_calls: pendingToolCalls
          });

          for (const call of pendingToolCalls) {
            const displayName = TOOL_DISPLAY_NAMES[call.function.name] ?? call.function.name;
            send({ type: "tool_start", tool: call.function.name, display: displayName });

            const result = await executeChatTool(call.function.name, call.function.arguments, context);

            send({ type: "tool_end", tool: call.function.name, display: result.display ?? displayName });

            messages.push({
              role: "tool",
              content: result.content,
              tool_call_id: call.id
            });
          }

          toolRound += 1;

          if (toolRound > CHAT_MAX_TOOL_ROUNDS) {
            // 达到工具调用上限,强制让 LLM 收尾(不再给 tools)。
            const finalEvents = client.streamChatCompletion({
              messages,
              signal: abortController.signal
            });

            for await (const event of finalEvents) {
              if (event.type === "delta") {
                assistantContent += event.content;
                send({ type: "delta", content: event.content });
              } else if (event.type === "error") {
                send({ type: "error", message: event.message });
                break;
              }
            }
            break;
          }

          // 下一轮继续流式(带 tools,可能再触发工具调用)。
        }

        // 5. 持久化用户消息 + 助手回复。
        const toPersist: ChatMessage[] = [userMessage];

        if (assistantContent.trim().length > 0) {
          toPersist.push({ role: "assistant", content: assistantContent });
        }

        await appendChatMessages(sessionId, toPersist);

        send({ type: "done" });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "对话处理失败"
        });
        send({ type: "done" });
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

/** DELETE /api/chat?sessionId=xxx — 清空对话历史。 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const cleared = await clearChatHistory(sessionId);

  return NextResponse.json({ ok: cleared, cleared });
}
