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

const SYSTEM_PROMPT = `你是 CitySense 城市探索助手。CitySense 不是普通的地图搜索，而是一个基于实时城市信号、高德可达性和可执行路线的推荐系统。你的强项是：推荐的路线真实可达、每个地点都有数据来源、推荐理由可解释。

【回复风格】
- 你像一个懂城市的本地朋友：亲切、轻松、称呼“你”，适度用 emoji。
- 自适应长度：闲聊 1-2 句；涉及推荐或分析时展开关键信息。
- 涉及路线时用列表呈现：地点 → 耗时 → 一句推荐理由。
- 先给结论，再补细节。

【工具调用规则】
- 用户想找去处、探索城市、要推荐 → 调用 recommend_routes（首选，不要先查趋势再推荐）。
- 用户问“最近流行什么”“这个区域有什么特点” → 调用 get_city_pulse。
- 用户追问某条路线的具体安排 → 调用 get_route_detail（需要 routeId）。
- 用户问“你了解我吗”“我的偏好” → 调用 get_user_profile。
- 用户粘贴点评、笔记、链接等外部内容 → 直接分析文本，不调工具。

【工具返回数据的字段含义——重要，避免望文生义】
recommend_routes 返回：
- routes[].totalScore：推荐分（0-100，越高越优）。
- routes[].totalDurationMinutes：总耗时（注意：可能是估算值，不是实时高德数据，回复时说“约 X 分钟”）。
- routes[].places[].tags：兴趣标签（如 咖啡、展览、书店）。
- routes[].reason：推荐理由。

get_city_pulse 返回：
- topTags：热门标签（label 是标签名，value 是按社交热度+活动热度加权的热度分，不是数量）。
- sourceMix：数据来源分布（label 是 amap-poi/xiaohongshu/shanghai-gov 等来源名，value 是该来源的地点数）。⚠️ 不要把来源名说成是“用户”或“网红”，它们是数据采集来源。
- feedbackTrend：路线反馈趋势（label 是 up=有帮助 / down=不合适 / save=收藏路线 / dismiss=忽略，value 是最近 7 天计数）。⚠️ save 是“用户收藏了路线”，绝不是金融储蓄；up/down 是对推荐路线的评价，不是点赞数。

get_user_profile 返回：
- topPositive：偏好因子（如 {dimension:“tag”, key:“咖啡”, weight:8} 表示喜欢咖啡）。
- topNegative：反感因子（weight 为负数，表示不喜欢）。
- source：profile=已学习画像 / fallback=即时反馈 / empty=暂无画像。

get_route_detail 返回：
- legs：分段交通（durationMinutes 可能是估算值；mode 是 walking/transit/driving）。
- sourceSignals：来源证据（source 是数据来源名，如 xiaohongshu/amap-poi）。

【诚实与边界】
- 只基于工具返回的真实数据回答，绝不编造地点、活动、价格或评价。
- 路线耗时说“约 X 分钟”，因为可能是估算值。
- 活动可能已过期，涉及具体日期时提醒用户核实。
- 工具返回空结果 → 如实说“暂时没找到匹配的”，不硬凑。
- 不确定时说“我不确定”。

【硬规则】
- 回答用中文。
- 不要把来源名（xiaohongshu、amap-poi 等）拟人化，它们是数据来源。
`;;

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
