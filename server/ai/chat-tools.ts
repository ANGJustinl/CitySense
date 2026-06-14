/**
 * CitySense AI 助手 — 工具定义与执行层。
 *
 * TASK-P2-004:4 个工具供 LLM function calling 调用,直接复用现有纯 async 函数,
 * 无 HTTP 中转。每个 handler 返回精简后的 JSON 字符串,避免把完整响应塞给 LLM。
 *
 * 工具:
 * 1. recommend_routes — 生成 3 条城市探索路线(会写 RecommendationLog)
 * 2. get_city_pulse — 查询城市/区域信号趋势(只读)
 * 3. get_route_detail — 查询已持久化路线详情(只读)
 * 4. get_user_profile — 查询用户画像摘要(只读)
 */

import { recommend } from "@/server/recommendation/recommend";
import { getCityPulse } from "@/server/recommendation/city-pulse";
import { getRouteDetail } from "@/server/routes/route-detail";
import { loadProfile, buildProfileMeta } from "@/server/recommendation/user-profile";
import type { ChatContext, ChatTool } from "@/server/ai/chat-client";

/** 工具定义,传给 LLM 的 tools 参数。 */
export const CHAT_TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "recommend_routes",
      description:
        "生成 3 条城市探索路线。当用户想找去处、探索城市、需要推荐时调用。会返回路线标题、地点、耗时、推荐分。",
      parameters: {
        type: "object",
        properties: {
          interests: {
            type: "array",
            items: { type: "string" },
            description: "兴趣标签,如 咖啡、展览、书店、独立音乐、夜生活、市集"
          },
          mood: {
            type: "string",
            enum: ["quiet", "lively", "date", "solo", "random"],
            description: "心情:quiet=安静、lively=热闹、date=约会、solo=独行、random=随机"
          },
          budget: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "预算:low=低、medium=中、high=高"
          },
          timeWindow: {
            type: "string",
            enum: ["now", "tonight", "weekend"],
            description: "时间窗口:now=现在、tonight=今晚、weekend=周末"
          },
          area: { type: "string", description: "区域,如 静安、徐汇、黄浦(可选)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_city_pulse",
      description:
        "查询城市或区域的信号趋势:热门标签、来源占比、反馈趋势。当用户问'最近流行什么''这个区有什么特点'时调用。",
      parameters: {
        type: "object",
        properties: {
          area: { type: "string", description: "区域名(可选,不传则查全城)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_route_detail",
      description:
        "查询某条已生成路线的完整详情:地点列表、交通分段、来源信号、推荐理由。当用户问'这条路线具体怎样''为什么推荐它'时调用。需要 routeId。",
      parameters: {
        type: "object",
        properties: {
          routeId: {
            type: "string",
            description: "路线快照 id,形如 abc123__route-1,来自之前推荐结果的 routes[].id"
          }
        },
        required: ["routeId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "查询当前用户的画像摘要:偏好因子、反感因子、近期曝光。当用户问'你了解我吗''我的偏好'时调用。不需要传参,使用当前会话用户。",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
];

/** 工具执行结果:返回给 LLM 的字符串 + 供前端展示的结构化摘要。 */
export type ToolExecutionResult = {
  /** 追加到 messages 的 tool result content。 */
  content: string;
  /** 供前端展示工具调用的轻量摘要(可选)。 */
  display?: string;
};

/** 精简推荐响应:只保留 LLM 需要的关键字段。 */
function summarizeRecommendation(result: Awaited<ReturnType<typeof recommend>>): string {
  const routes = result.routes.map((route, index) => ({
    index: index + 1,
    id: route.id,
    title: route.title,
    summary: route.summary,
    totalScore: route.totalScore,
    totalDurationMinutes: route.traffic.estimatedDurationMinutes,
    places: route.places.map((place) => ({
      name: place.name,
      area: place.area,
      tags: place.tags.slice(0, 4)
    })),
    reason: route.reason
  }));

  return JSON.stringify({
    recommendationId: result.meta.recommendationId,
    candidateCount: result.meta.candidateCount,
    routes
  });
}

function summarizeCityPulse(pulse: Awaited<ReturnType<typeof getCityPulse>>): string {
  return JSON.stringify({
    topTags: pulse.topTags.slice(0, 6),
    sourceMix: pulse.sourceMix.slice(0, 5),
    feedbackTrend: pulse.feedbackTrend.slice(0, 4),
    trafficSnapshots: pulse.trafficCache.snapshotCount
  });
}

function summarizeRouteDetail(detail: NonNullable<Awaited<ReturnType<typeof getRouteDetail>>>): string {
  const { route, recommendation } = detail;
  return JSON.stringify({
    routeId: route.id,
    title: route.title,
    totalScore: route.totalScore,
    totalDurationMinutes: route.traffic.estimatedDurationMinutes,
    places: route.places.map((place) => ({
      name: place.name,
      area: place.area,
      address: place.address,
      tags: place.tags.slice(0, 4),
      source: place.source
    })),
    legs: (route.legs ?? []).map((leg) => ({
      from: leg.fromName,
      to: leg.toName,
      durationMinutes: leg.durationMinutes,
      mode: leg.mode,
      transitLines: leg.transitLines
    })),
    sourceSignals: route.sourceSignals.slice(0, 5),
    reason: route.reason,
    tips: route.tips,
    originalInput: recommendation.input
  });
}

/**
 * 执行单个工具调用。
 * context 提供 profileKey/sessionId/recommendationId,用于工具参数补全(如 user_profile 无参时用 profileKey)。
 * 任何失败返回错误占位字符串,LLM 据此告知用户,不抛异常。
 */
export async function executeChatTool(
  name: string,
  rawArgs: string,
  context: ChatContext
): Promise<ToolExecutionResult> {
  let args: Record<string, unknown> = {};

  try {
    args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { content: `工具参数解析失败: ${rawArgs.slice(0, 100)}` };
  }

  try {
    switch (name) {
      case "recommend_routes": {
        const city = (args.city as string) || context.city || "上海";
        const result = await recommend({
          userId: context.profileKey,
          sessionId: context.sessionId,
          city,
          area: (args.area as string) || context.area,
          interests: Array.isArray(args.interests) ? (args.interests as string[]) : ["咖啡", "展览"],
          mood: ((args.mood as string) || "solo") as "quiet" | "lively" | "date" | "solo" | "random",
          budget: ((args.budget as string) || "medium") as "low" | "medium" | "high",
          timeWindow: ((args.timeWindow as string) || "tonight") as "now" | "tonight" | "weekend",
          useRealtimeTraffic: false,
          useSocialSignals: true
        });
        const routesBrief = result.routes
          .map((r) => r.title)
          .join("、");
        return {
          content: summarizeRecommendation(result),
          display: result.routes.length > 0 ? `找到 ${result.routes.length} 条路线:${routesBrief}` : "未找到匹配路线"
        };
      }

      case "get_city_pulse": {
        const pulse = await getCityPulse({
          city: context.city || "上海",
          area: (args.area as string) || context.area
        });
        return {
          content: summarizeCityPulse(pulse),
          display: `热门标签:${pulse.topTags.slice(0, 3).map((t) => t.label).join("、")}`
        };
      }

      case "get_route_detail": {
        const routeId = args.routeId as string;
        if (!routeId) {
          return { content: "缺少 routeId 参数" };
        }
        const detail = await getRouteDetail(routeId);
        if (!detail) {
          return { content: `未找到路线 ${routeId},可能已过期或 id 无效` };
        }
        return {
          content: summarizeRouteDetail(detail),
          display: `路线详情:${detail.route.title}`
        };
      }

      case "get_user_profile": {
        const profileKey = (args.profileKey as string) || context.profileKey;
        if (!profileKey) {
          return { content: "当前为匿名会话,暂无画像数据。可让用户先给路线反馈建立画像。" };
        }
        const { snapshot } = await loadProfile(profileKey);
        const meta = buildProfileMeta(snapshot, snapshot ? "profile" : "empty");
        return {
          content: JSON.stringify(meta),
          display:
            meta.source === "empty"
              ? "暂无画像数据"
              : `偏好:${meta.topPositive.slice(0, 3).map((f) => f.key).join("、")}`
        };
      }

      default:
        return { content: `未知工具: ${name}` };
    }
  } catch (error) {
    return {
      content: `工具 ${name} 执行失败: ${error instanceof Error ? error.message : "未知错误"}`
    };
  }
}

/** 工具名 → 中文名映射,供前端展示。 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  recommend_routes: "查询推荐路线",
  get_city_pulse: "查询城市信号",
  get_route_detail: "查询路线详情",
  get_user_profile: "查询用户画像"
};
