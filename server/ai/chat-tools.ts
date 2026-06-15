/**
 * CitySense AI 助手 — 工具定义与执行层。
 *
 * TASK-P2-004:4 个工具供 LLM function calling 调用,直接复用现有纯 async 函数,
 * 无 HTTP 中转。每个 handler 返回精简后的 JSON 字符串,避免把完整响应塞给 LLM。
 *
 * 增强（TASK-P2-004-E）: 新增 4 个工具,共 8 个:
 * 1. recommend_routes — 生成 3 条城市探索路线(会写 RecommendationLog)
 * 2. get_city_pulse — 查询城市/区域信号趋势(只读)
 * 3. get_route_detail — 查询已持久化路线详情(只读)
 * 4. get_user_profile — 查询用户画像摘要(只读)
 * 5. record_feedback — 收藏/反馈路线(写入,闭环画像)
 * 6. get_weather — 查询实时天气+预报(高德 API)
 * 7. search_activities — 按关键词搜索活动/演出
 * 8. plan_multi_day — 多日行程规划(循环调用 recommend)
 */

import { recommend } from "@/server/recommendation/recommend";
import { getCityPulse } from "@/server/recommendation/city-pulse";
import { getRouteDetail } from "@/server/routes/route-detail";
import { getUserProfileSummary } from "@/server/recommendation/user-profile-v2";
import { recordFeedback } from "@/server/recommendation/feedback";
import { getWeather } from "@/server/maps/weather";
import { searchActivities } from "@/server/recommendation/activity-search";
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
  },
  {
    type: "function",
    function: {
      name: "record_feedback",
      description:
        "记录用户对路线的反馈(收藏/有帮助/不合适)。当用户说'收藏这条路线''这条不错''不喜欢这个推荐'时调用。需要 recommendationId 和 routeId,从对话上下文或之前推荐结果获取。",
      parameters: {
        type: "object",
        properties: {
          value: {
            type: "string",
            enum: ["up", "down", "save", "dismiss"],
            description: "反馈类型:up=有帮助、save=收藏、down=不合适、dismiss=忽略"
          },
          routeId: {
            type: "string",
            description: "路线 id,形如 abc123__route-1。不传则默认反馈第一条路线。"
          },
          reason: {
            type: "string",
            description: "反馈原因(可选,如 too_far, not_interested)"
          }
        },
        required: ["value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "查询城市或区域的实时天气和预报。当用户问'今天天气怎么样''周末会下雨吗''适合户外吗'时调用。可用于结合天气给出行建议。",
      parameters: {
        type: "object",
        properties: {
          area: { type: "string", description: "区域名(可选,不传则查城市级)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_activities",
      description:
        "按关键词搜索具体的活动或演出。当用户问'最近有什么展览''有没有音乐节''搜一下咖啡活动'时调用。返回单品列表,不是完整路线。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "搜索关键词,如 展览、演出、市集、咖啡、音乐"
          },
          area: { type: "string", description: "区域(可选)" }
        },
        required: ["keyword"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "plan_multi_day",
      description:
        "规划多日行程。当用户说'帮我规划两天/三天的行程''周末两天怎么安排'时调用。每天会生成一条精选路线,不同天可以有不同的兴趣和区域。",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                interests: {
                  type: "array",
                  items: { type: "string" },
                  description: "当天的兴趣标签"
                },
                timeWindow: {
                  type: "string",
                  enum: ["now", "tonight", "weekend"],
                  description: "时间窗口"
                },
                area: { type: "string", description: "当天重点区域(可选)" }
              }
            },
            description: "每天的行程配置,最多 3 天"
          }
        },
        required: ["days"]
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
  /** 结构化卡片数据(可选,供前端富文本渲染)。 */
  cards?: Array<Record<string, unknown>>;
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

function summarizeWeather(result: NonNullable<Awaited<ReturnType<typeof getWeather>>>): string {
  return JSON.stringify({
    city: result.city,
    live: {
      phenomenon: result.live.phenomenon,
      temperature: result.live.temperature,
      windDirection: result.live.windDirection,
      windPower: result.live.windPower,
      humidity: result.live.humidity,
      reportTime: result.live.reportTime
    },
    forecast: result.forecast.slice(0, 4).map((f) => ({
      date: f.date,
      dayWeather: f.dayWeather,
      nightWeather: f.nightWeather,
      dayTemp: f.dayTemp,
      nightTemp: f.nightTemp
    }))
  });
}

function summarizeActivities(activities: Awaited<ReturnType<typeof searchActivities>>): string {
  return JSON.stringify(
    activities.map((a) => ({
      id: a.id,
      title: a.title,
      area: a.area,
      address: a.address,
      startTime: a.startTime,
      tags: a.tags.slice(0, 4),
      source: a.source,
      trendScore: a.trendScore,
      qualityScore: a.qualityScore
    }))
  );
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
          display: result.routes.length > 0 ? `找到 ${result.routes.length} 条路线:${routesBrief}` : "未找到匹配路线",
          cards: result.routes.slice(0, 3).map((route) => ({
            kind: "route" as const,
            title: route.title,
            score: route.totalScore,
            places: route.places.map((p) => p.name),
            duration: route.traffic.estimatedDurationMinutes,
            reason: route.reason.slice(0, 80),
            routeId: route.id
          }))
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
        const summary = await getUserProfileSummary(profileKey);
        const topTags = summary.summary?.topPositiveTags ?? [];
        const meta = {
          source: summary.degraded ? "empty" : "profile",
          topPositive: topTags.map((t) => ({ key: t.tag, weight: t.weight }))
        };
        return {
          content: JSON.stringify(meta),
          display:
            meta.source === "empty"
              ? "暂无画像数据"
              : `偏好:${meta.topPositive.slice(0, 3).map((f) => f.key).join("、")}`
        };
      }

      case "record_feedback": {
        const value = args.value as "up" | "down" | "save" | "dismiss";
        if (!value) {
          return { content: "缺少 value 参数(up/down/save/dismiss)" };
        }
        const recommendationId =
          (args.recommendationId as string) || context.recommendationId;
        if (!recommendationId) {
          return {
            content: "缺少 recommendationId,请先推荐路线再反馈。上下文中没有最近推荐记录。"
          };
        }
        // routeId 可选,默认反馈 route-1(第一条)。
        const routeId = (args.routeId as string) || `${recommendationId.split("__")[0]}__route-1`;
        const reason = args.reason as string | undefined;

        const result = await recordFeedback({
          recommendationLogId: recommendationId,
          routeId,
          userId: context.profileKey,
          sessionId: context.sessionId,
          value,
          ...(reason ? { reason } : {})
        });

        const valueLabel: Record<string, string> = {
          up: "有帮助",
          down: "不合适",
          save: "已收藏",
          dismiss: "已忽略"
        };
        return {
          content: JSON.stringify(result),
          display: `反馈:${valueLabel[value] ?? value}`
        };
      }

      case "get_weather": {
        const city = context.city || "上海";
        const area = (args.area as string) || context.area;
        const weather = await getWeather({ city, area });
        if (!weather) {
          return {
            content: "天气查询失败,可能未配置高德 API key 或城市不支持。请基于常识回答天气相关问题。"
          };
        }
        const tempLabel = `${weather.live.temperature}°`;
        return {
          content: summarizeWeather(weather),
          display: `${city}${area ?? ""}:${weather.live.phenomenon} ${tempLabel}`,
          cards: [
            {
              kind: "weather" as const,
              city,
              phenomenon: weather.live.phenomenon,
              temperature: weather.live.temperature,
              forecast: weather.forecast.slice(0, 4).map((f) => ({
                date: f.date,
                dayWeather: f.dayWeather,
                dayTemp: f.dayTemp
              }))
            }
          ]
        };
      }

      case "search_activities": {
        const keyword = args.keyword as string;
        if (!keyword) {
          return { content: "缺少 keyword 参数" };
        }
        const city = context.city || "上海";
        const area = (args.area as string) || context.area;
        const activities = await searchActivities({ city, keyword, area });
        if (activities.length === 0) {
          return { content: JSON.stringify({ message: `未找到与"${keyword}"相关的活动` }) };
        }
        return {
          content: summarizeActivities(activities),
          display: `找到 ${activities.length} 个"${keyword}"相关活动`,
          cards: activities.slice(0, 6).map((a) => ({
            kind: "activity" as const,
            title: a.title,
            area: a.area,
            tags: a.tags.slice(0, 4),
            trendScore: a.trendScore,
            startTime: a.startTime
          }))
        };
      }

      case "plan_multi_day": {
        const days = args.days as Array<{
          interests?: string[];
          timeWindow?: string;
          area?: string;
        }>;
        if (!Array.isArray(days) || days.length === 0) {
          return { content: "缺少 days 参数或格式不正确" };
        }
        // 限制最多 3 天,避免过多调用。
        const limitedDays = days.slice(0, 3);
        const city = context.city || "上海";
        const dayResults: Array<{ day: number; title: string; places: string[]; score: number }> = [];

        for (let i = 0; i < limitedDays.length; i += 1) {
          const day = limitedDays[i];
          const result = await recommend({
            userId: context.profileKey,
            sessionId: context.sessionId,
            city,
            area: day.area || context.area,
            interests: Array.isArray(day.interests) ? day.interests : ["咖啡", "展览"],
            mood: "solo",
            budget: "medium",
            timeWindow: ((day.timeWindow as string) || "weekend") as "now" | "tonight" | "weekend",
            useRealtimeTraffic: false,
            useSocialSignals: true
          });
          const topRoute = result.routes[0];
          if (topRoute) {
            dayResults.push({
              day: i + 1,
              title: topRoute.title,
              places: topRoute.places.map((p) => p.name),
              score: topRoute.totalScore
            });
          }
        }

        if (dayResults.length === 0) {
          return { content: "多日规划未能生成任何路线" };
        }
        return {
          content: JSON.stringify(dayResults),
          display: `${dayResults.length} 天行程:${dayResults.map((d) => `Day${d.day} ${d.places[0] ?? ""}`).join(" → ")}`
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
  get_user_profile: "查询用户画像",
  record_feedback: "记录反馈",
  get_weather: "查询天气",
  search_activities: "搜索活动",
  plan_multi_day: "规划多日行程"
};
