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
  createDefaultChatVisionClient,
  CHAT_DEFAULT_TIMEOUT_MS,
  CHAT_MAX_TOOL_ROUNDS,
  type ChatMessage,
  type ChatContentPart
} from "@/server/ai/chat-client";
import { loadOwnedChatImages } from "@/server/ai/chat-images";
import { CHAT_TOOLS, executeChatTool, TOOL_DISPLAY_NAMES } from "@/server/ai/chat-tools";
import { appendChatMessages, clearChatHistory, loadChatHistory } from "@/server/ai/chat-session";
import {
  ProfileAccessError,
  normalizeProfileKey,
  requireOwnedProfileKey
} from "@/server/auth/profile-access";
import { getOptionalUser } from "@/server/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `你是 CitySense 城市探索助手。CitySense 不是普通的地图搜索，而是一个基于实时城市信号、高德可达性和可执行路线的推荐系统。你的强项是：推荐的路线真实可达、每个地点都有数据来源、推荐理由可解释。

【回复风格】
- 你像一个懂城市的本地朋友：亲切、轻松、称呼”你”，适度用 emoji。
- 自适应长度：闲聊 1-2 句；涉及推荐或分析时展开关键信息。
- 涉及路线时用列表呈现：地点 → 耗时 → 一句推荐理由。
- 先给结论，再补细节。

【主动追问——信息不足时先问再调工具】
- 用户说”帮我推荐”但没说兴趣/时间/区域 → 先追问：”你偏好安静还是热闹？白天还是晚上？有没有想去的区域？”
- 用户说”规划行程”但没说几天 → 先问：”你计划几天？每天偏好一样还是想换换风格？”
- 只有信息足够时才调用工具，不要盲目猜测参数。

【工具调用规则】
- 用户想找去处、探索城市、要推荐 → 调用 recommend_routes（首选，不要先查趋势再推荐）。
- 用户问”最近流行什么””这个区域有什么特点” → 调用 get_city_pulse。
- 用户追问某条路线的具体安排 → 调用 get_route_detail（需要 routeId）。
- 用户问”你了解我吗””我的偏好” → 调用 get_user_profile。
- 用户说”收藏这条””不错””喜欢””不合适””不喜欢” → 调用 record_feedback（用最近的 recommendationId）。
- 用户问”天气怎么样””会下雨吗””适合户外吗” → 调用 get_weather，再结合天气给建议。
- 用户问”有什么展览””有没有演出””搜一下XX” → 调用 search_activities（单品搜索，不是路线）。
- 用户说”规划两天/三天行程””周末怎么安排” → 调用 plan_multi_day（每天可不同兴趣）。
- 用户问城市手记、社区动态 → 调用 list_community_posts。
- 用户问某个地点是否存在或需要关联地点 ID → 调用 search_places。
- 用户问小众榜/超夯榜 → 调用 get_venue_ranking。
- 用户粘贴点评、笔记、链接等外部内容 → 直接分析文本，不调工具。

【写操作——必须先生成预览并等待用户确认】
- 发手记、地点投稿、搭子、资料、点赞、收藏和关注等写操作，工具只会生成待确认卡片；绝不能在用户确认前声称已经完成。
- 用户在确认卡点击“确认执行”后，收到成功结果才能告知已发布/已提交。
- 地点投稿需要现场图片时，引导用户在聊天上传卡或投稿页补充；不得编造图片或绕过审核。
- 缺少关键信息时先追问，不要猜测路线、时间、集合点、地点地址或可见性。
- 所有写操作都要求登录；未登录时引导 /login。
- 用户说“发条手记/记录一下今天的发现” → 调用 create_community_post 生成待确认动作。
- 用户说“分享个地点/这个地方小众” → 调用 submit_place 生成地点投稿预览。
- 用户说“找个搭子/组队” → 调用 create_buddy_intent；若没有路线先推荐并确认路线与时间。
- 用户说“我也想去/加入这个搭子” → 调用 apply_buddy_intent。
- 用户说“完善资料/设置昵称” → 调用 save_user_profile。
- 用户说“点赞/收藏/关注” → 调用对应工具生成待确认动作。

【上下文记忆——记住本轮对话推荐的路线】
- 推荐路线后，记住路线编号和名称。用户说”收藏第二条”时，对应到 route-2。
- 用户说”第一条具体怎样”时，用对应 routeId 调 get_route_detail。
- 如果上下文中没有推荐过路线，用户却说”收藏”→ 先提醒”你还没推荐路线，要不要我先推荐几条？”

【工具返回数据的字段含义——重要，避免望文生义】
recommend_routes 返回：
- routes[].totalScore：推荐分（0-100，越高越优）。
- routes[].totalDurationMinutes：总耗时（注意：可能是估算值，不是实时高德数据，回复时说”约 X 分钟”）。
- routes[].places[].tags：兴趣标签（如 咖啡、展览、书店）。
- routes[].reason：推荐理由。

get_city_pulse 返回：
- topTags：热门标签（label 是标签名，value 是按社交热度+活动热度加权的热度分，不是数量）。
- sourceMix：数据来源分布（label 是 amap-poi/xiaohongshu/shanghai-gov 等来源名，value 是该来源的地点数）。⚠️ 不要把来源名说成是”用户”或”网红”，它们是数据采集来源。
- feedbackTrend：路线反馈趋势（label 是 up=有帮助 / down=不合适 / save=收藏路线 / dismiss=忽略，value 是最近 7 天计数）。⚠️ save 是”用户收藏了路线”，绝不是金融储蓄。

get_user_profile 返回：
- topPositive：偏好因子（如 {dimension:”tag”, key:”咖啡”, weight:8} 表示喜欢咖啡）。
- source：profile=已学习画像 / fallback=即时反馈 / empty=暂无画像。

get_route_detail 返回：
- legs：分段交通（durationMinutes 可能是估算值）。
- sourceSignals：来源证据（source 是数据来源名）。

get_weather 返回：
- live：实况天气（phenomenon=天气现象如晴/雨/阴，temperature=温度，windPower=风力等级）。
- forecast：未来几天预报（dayWeather/nightWeather=白天/夜间天气，dayTemp/nightTemp=白天/夜间温度）。
- 结合天气给建议：下雨天推荐室内（展览/书店/咖啡馆），晴天推荐户外（公园/市集/滨江）。

search_activities 返回：
- 数组，每个元素是一个活动（title=活动名，area=区域，trendScore=热度分，startTime=开始时间）。
- trendScore 是综合热度，不是参与人数。

plan_multi_day 返回：
- 数组，每天一条精选路线（day=第几天，title=路线标题，places=地点列表，score=推荐分）。

record_feedback 返回：
- ok:true 表示成功。用户画像会随之更新，下次推荐更精准。

【天气结合推荐的示例】
- 用户问”今天适合出去玩吗” → 先调 get_weather，再根据天气调 recommend_routes：
  下雨 → “今天有小雨 🌧️，推荐室内路线：展览 → 书店 → 咖啡馆”
  晴天 → “天气不错 ☀️，推荐户外：公园 → 市集 → 滨江”

【诚实与边界】
- 只基于工具返回的真实数据回答，绝不编造地点、活动、价格或评价。
- 路线耗时说”约 X 分钟”，因为可能是估算值。
- 活动可能已过期，涉及具体日期时提醒用户核实。
- 工具返回空结果 → 如实说”暂时没找到匹配的”，不硬凑。
- 不确定时说”我不确定”。
- 天气查询失败 → 基于常识回答，不要编造具体温度。

【硬规则】
- 回答用中文。
- 不要把来源名（xiaohongshu、amap-poi 等）拟人化，它们是数据来源。
`;

type ChatRequestBody = {
  sessionId?: string;
  message: string;
  context?: {
    profileKey?: string;
    recommendationId?: string;
    city?: string;
    area?: string;
  };
  /** 已上传的暂存图 ChatImage.id 列表(可选,最多 5 张)。 */
  imageIds?: string[];
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
  const imageIds = Array.isArray(body.imageIds) ? body.imageIds.filter((id) => typeof id === "string" && id.length > 0).slice(0, 5) : [];

  // 有图时允许纯图(无文字),但二者不可同时为空。
  if (!message && imageIds.length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: "message too long (max 2000 chars)" }, { status: 400 });
  }

  // 解析登录用户(可选):图片校验、写操作都需要;读操作允许匿名。
  const viewer = await getOptionalUser();

  // 校验并加载图片 URL。图片必须属于当前登录用户,避免伪造他人图片。
  let imageParts: ChatContentPart[] = [];
  if (imageIds.length > 0) {
    if (!viewer) {
      return NextResponse.json({ error: "上传图片需先登录", code: "auth_required" }, { status: 401 });
    }
    const owned = await loadOwnedChatImages({ ownerUserId: viewer.appUser.id, imageIds });
    // 按 imageIds 顺序对齐(丢弃不属于该用户的 id)。
    const byId = new Map(owned.map((img) => [img.id, img]));
    imageParts = imageIds
      .map((id) => byId.get(id))
      .filter((img): img is NonNullable<typeof img> => Boolean(img))
      .map((img) => ({ type: "image_url" as const, image_url: { url: img.publicUrl } }));

    if (imageParts.length === 0) {
      return NextResponse.json({ error: "图片不存在或无权使用" }, { status: 400 });
    }
  }

  const hasImages = imageParts.length > 0;
  const textClient = createDefaultChatClient();
  const visionClient = createDefaultChatVisionClient();

  // 无 LLM key(任何模型都没有)→ 降级。
  if (!textClient && !visionClient) {
    return new Response(
      sseData({ type: "error", message: "AI 助手未配置(缺少 OPENAI_API_KEY),请联系管理员。" }) +
        sseData({ type: "done" }),
      {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      }
    );
  }

  // 带图消息但视觉模型未配置 → 友好降级,不把图喂给文本模型。
  if (hasImages && !visionClient) {
    return new Response(
      sseData({ type: "error", message: "图片识别未配置(缺少 CHAT_LLM_VISION_MODEL),暂无法看图。请去掉图片后重试。" }) +
        sseData({ type: "done" }),
      {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      }
    );
  }

  // 按需切换:带图走视觉模型(glm-4.5v),纯文字走文本模型(glm-4-flash,tools 稳定)。
  // 经上面两个 guard 后此处 client 必有值。
  const client = (hasImages ? visionClient : textClient)!;

  let sessionId: string | undefined;
  let profileKey: string | undefined;

  try {
    sessionId = normalizeProfileKey(body.sessionId);
    profileKey = requireOwnedProfileKey({
      requestedProfileKey: body.context?.profileKey ?? sessionId,
      sessionId,
      allowEmpty: true
    });
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status }
      );
    }

    throw error;
  }

  const context = {
    sessionId,
    profileKey,
    appUserId: viewer?.appUser.id,
    recommendationId: body.context?.recommendationId,
    city: body.context?.city || "北京",
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
        // 有图时构建多模态 content(OpenAI/智谱通用格式);无图时保持纯文本。
        const userMessage: ChatMessage = hasImages
          ? {
              role: "user",
              content: [
                ...(message ? [{ type: "text" as const, text: message }] : []),
                ...imageParts
              ]
            }
          : { role: "user", content: message };
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

            send({
              type: "tool_end",
              tool: call.function.name,
              display: result.display ?? displayName,
              ...(result.cards && result.cards.length > 0 ? { cards: result.cards } : {})
            });

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
