import type {
  CandidateType,
  RecommendedRoute,
  RecommendInput,
  SourceSignal,
  TrafficCandidate,
  TrafficInfo
} from "@/server/recommendation/types";
import {
  createLlmClient,
  llmTimeoutMs,
  withLlmTimeout
} from "@/server/ai/llm-client";
import type { OpenAiCompatibleClient } from "@/server/ai/llm-client";

const DEFAULT_OPENAI_MODEL = "glm-4.6";
const DEFAULT_LLM_TIMEOUT_MS = 8_000;
const MAX_SOURCE_CONTEXT_ITEMS = 8;

export type SourceContextItem = {
  id: string;
  source: string;
  name: string;
  type: CandidateType;
  city: string;
  area?: string;
  address?: string;
  tags: string[];
  sourceUrl?: string;
  trendScore: number;
  confidence: number;
};

export type RouteExplanationFact = {
  id: string;
  title: string;
  summary: string;
  totalScore: number;
  traffic: TrafficInfo;
  places: RecommendedRoute["places"];
  sourceSignals: SourceSignal[];
};

export type RouteExplanationRequest = {
  input: Pick<RecommendInput, "city" | "area" | "interests" | "mood" | "budget" | "timeWindow">;
  routes: RouteExplanationFact[];
  sourceContext: SourceContextItem[];
};

export type RouteExplanation = {
  routeId: string;
  reason: string;
  tips: string[];
  citedPlaceIds: string[];
  citedSignalSources: string[];
};

export type RouteExplanationPayload = {
  routes: RouteExplanation[];
};

export type RouteExplanationClient = {
  explain(
    request: RouteExplanationRequest,
    signal?: AbortSignal
  ): Promise<RouteExplanationPayload | null>;
};

type ExplainRoutesOptions = {
  client?: RouteExplanationClient;
  sourceContext?: SourceContextItem[];
  timeoutMs?: number;
};

function timeWindowText(timeWindow: RecommendInput["timeWindow"]) {
  if (timeWindow === "now") return "现在出发";
  if (timeWindow === "tonight") return "今晚";
  return "这个周末";
}

function routeFacts(routes: RecommendedRoute[]): RouteExplanationFact[] {
  return routes.map((route) => ({
    id: route.id,
    title: route.title,
    summary: route.summary,
    totalScore: route.totalScore,
    traffic: route.traffic,
    places: route.places,
    sourceSignals: route.sourceSignals
  }));
}

function localExplainRoutes(routes: RecommendedRoute[], input: RecommendInput) {
  return routes.map((route) => {
    const topSignal = route.sourceSignals[0];
    const firstPlace = route.places[0];
    const tags = [...new Set(route.places.flatMap((place) => place.tags))].slice(0, 3);

    return {
      ...route,
      reason: `${timeWindowText(input.timeWindow)}适合走这条线：${firstPlace?.name ?? "候选地点"} 和你的 ${tags.join("、")} 偏好重合，${topSignal?.label ?? "城市信号"} 支撑热度，交通大约 ${route.traffic.estimatedDurationMinutes} 分钟。`,
      tips: [
        route.traffic.congestion === "busy"
          ? "路上略忙，建议提前 10 分钟出发。"
          : "交通压力不高，可以按推荐顺序走。",
        input.mood === "quiet"
          ? "优先选择靠窗或角落位置，避开高峰停留。"
          : "可以把第一站作为集合点，后续按现场状态加减停留。",
        topSignal?.evidence ?? "推荐结果来自已沉淀的城市信号，不依赖实时爬虫。"
      ]
    };
  });
}

function routeInput(input: RecommendInput): RouteExplanationRequest["input"] {
  return {
    city: input.city,
    area: input.area,
    interests: input.interests,
    mood: input.mood,
    budget: input.budget,
    timeWindow: input.timeWindow
  };
}

export function buildSourceContextItems(
  candidates: TrafficCandidate[],
  limit = MAX_SOURCE_CONTEXT_ITEMS
): SourceContextItem[] {
  const seenSources = new Set<string>();
  const items: SourceContextItem[] = [];

  for (const candidate of candidates) {
    const source = candidate.source?.trim();

    if (!source || seenSources.has(source)) {
      continue;
    }

    seenSources.add(source);
    items.push({
      id: candidate.id,
      source,
      name: candidate.name,
      type: candidate.type,
      city: candidate.city,
      area: candidate.area,
      address: candidate.address,
      tags: candidate.tags.slice(0, 6),
      sourceUrl: candidate.sourceUrl,
      trendScore: Math.round(candidate.trendScore),
      confidence: Math.round(candidate.confidence)
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function createDefaultRouteExplanationClient(): RouteExplanationClient | undefined {
  const shared = createLlmClient({ defaultModel: DEFAULT_OPENAI_MODEL });
  return shared ? adaptSharedRouteExplanationClient(shared) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
}

function parseRouteExplanationPayload(value: unknown): RouteExplanationPayload | null {
  if (!isRecord(value) || !Array.isArray(value.routes)) {
    return null;
  }

  const routes = value.routes.flatMap((item): RouteExplanation[] => {
    if (!isRecord(item)) {
      return [];
    }

    const routeId = typeof item.routeId === "string" ? item.routeId.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    const tips = stringArray(item.tips).filter(Boolean).slice(0, 3);
    const citedPlaceIds = stringArray(item.citedPlaceIds).filter(Boolean);
    const citedSignalSources = stringArray(item.citedSignalSources).filter(Boolean);

    if (!routeId || !reason || tips.length === 0) {
      return [];
    }

    return [
      {
        routeId,
        reason,
        tips,
        citedPlaceIds,
        citedSignalSources
      }
    ];
  });

  return { routes };
}

const ROUTE_EXPLANATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    routes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          routeId: { type: "string" },
          reason: { type: "string" },
          tips: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" }
          },
          citedPlaceIds: {
            type: "array",
            items: { type: "string" }
          },
          citedSignalSources: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["routeId", "reason", "tips", "citedPlaceIds", "citedSignalSources"]
      }
    }
  },
  required: ["routes"]
};

const ROUTE_EXPLANATION_INSTRUCTIONS = [
  "你是 CitySense 的推荐解释层，只能基于输入 JSON 中的事实改写路线 reason 和 tips。",
  "不要新增地点、活动、URL、来源或实时状态。路线候选、排序和交通结果已经确定，不能改变。",
  "sourceContext 是本轮各信息源候选的第一条结果，只能用于判断来源覆盖和语气，不得把不在 routes[].places 中的 sourceContext.name 写成路线地点。",
  "每条解释必须填写 citedPlaceIds 和 citedSignalSources；这些值只能来自同一 route 的 places[].id 与 sourceSignals[].source。",
  "用中文输出，reason 一句话，tips 1 到 3 条，每条简短可执行。"
].join("\n");

function adaptSharedRouteExplanationClient(client: OpenAiCompatibleClient): RouteExplanationClient {
  return {
    async explain(request, signal) {
      const text = await client.completeJsonOrNull({
        instructions: ROUTE_EXPLANATION_INSTRUCTIONS,
        schema: ROUTE_EXPLANATION_SCHEMA,
        userPayload: request,
        maxTokens: 900,
        signal
      });

      return text ? parseRouteExplanationPayload(JSON.parse(text)) : null;
    }
  };
}

function explanationText(explanation: RouteExplanation) {
  return [explanation.reason, ...explanation.tips].join("\n");
}

function includesUrl(text: string) {
  return /https?:\/\//i.test(text);
}

function isGroundedExplanation(
  route: RecommendedRoute,
  explanation: RouteExplanation,
  sourceContext: SourceContextItem[]
) {
  const placeIds = new Set(route.places.map((place) => place.id));
  const placeNames = new Set(route.places.map((place) => place.name));
  const signalSources = new Set(route.sourceSignals.map((signal) => signal.source));
  const text = explanationText(explanation);

  if (explanation.reason.length > 260 || explanation.tips.some((tip) => tip.length > 180)) {
    return false;
  }

  if (includesUrl(text)) {
    return false;
  }

  if (
    explanation.citedPlaceIds.length === 0 ||
    explanation.citedPlaceIds.some((placeId) => !placeIds.has(placeId))
  ) {
    return false;
  }

  if (explanation.citedSignalSources.some((source) => !signalSources.has(source))) {
    return false;
  }

  const contextOnlyNames = sourceContext
    .filter((item) => !placeIds.has(item.id) && !placeNames.has(item.name))
    .map((item) => item.name)
    .filter(Boolean);

  return !contextOnlyNames.some((name) => text.includes(name));
}

function mergeModelExplanations(
  routes: RecommendedRoute[],
  payload: RouteExplanationPayload | null,
  sourceContext: SourceContextItem[]
) {
  if (!payload) {
    return routes;
  }

  const explanations = new Map(payload.routes.map((route) => [route.routeId, route]));

  return routes.map((route) => {
    const explanation = explanations.get(route.id);

    if (!explanation || !isGroundedExplanation(route, explanation, sourceContext)) {
      return route;
    }

    return {
      ...route,
      reason: explanation.reason,
      tips: explanation.tips
    };
  });
}

export async function explainRoutes(
  routes: RecommendedRoute[],
  input: RecommendInput,
  options: ExplainRoutesOptions = {}
) {
  const localRoutes = localExplainRoutes(routes, input);
  const client = options.client ?? createDefaultRouteExplanationClient();

  if (!client) {
    return localRoutes;
  }

  const sourceContext = options.sourceContext ?? [];
  const request: RouteExplanationRequest = {
    input: routeInput(input),
    routes: routeFacts(localRoutes),
    sourceContext
  };
  const timeoutMs = options.timeoutMs ?? llmTimeoutMs("OPENAI_TIMEOUT_MS", DEFAULT_LLM_TIMEOUT_MS);

  try {
    const payload = await withLlmTimeout({
      timeoutMs,
      task: (signal) => client.explain(request, signal)
    });

    return mergeModelExplanations(localRoutes, payload, sourceContext);
  } catch {
    return localRoutes;
  }
}
