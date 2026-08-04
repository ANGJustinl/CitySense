import type {
  MomentRecommendationCard,
  RecommendInput,
  RecommendResponse,
  RecommendedRoute
} from "@/server/recommendation/types";
import {
  createLlmClient,
  llmTimeoutMs,
  withLlmTimeout
} from "@/server/ai/llm-client";
import type { OpenAiCompatibleClient } from "@/server/ai/llm-client";

const DEFAULT_OPENAI_MODEL = "glm-4.6";
const DEFAULT_LLM_TIMEOUT_MS = 6_000;

export type MomentCardGenerationRequest = {
  input: Pick<RecommendInput, "city" | "area" | "interests" | "mood" | "budget" | "timeWindow">;
  profileApplied?: RecommendResponse["meta"]["profileApplied"];
  routes: MomentCardRouteFact[];
};

export type MomentCardRouteFact = {
  id: string;
  title: string;
  summary: string;
  reason: string;
  trafficMinutes: number;
  trafficProvider: string;
  places: {
    id: string;
    name: string;
    type: string;
    tags: string[];
    source?: string;
  }[];
  sourceSignals: {
    source: string;
    label: string;
    evidence?: string;
  }[];
  momentFit?: {
    whyNow: string;
    facts: {
      label: string;
      value: string;
      source?: string;
    }[];
  };
  evidence?: {
    signalRoles: {
      source: string;
      role: string;
      label: string;
    }[];
    caveats: string[];
  };
};

export type MomentCardPayload = {
  routes: {
    routeId: string;
    headline: string;
    message: string;
    primaryReason: string;
    timingHint?: string;
    nextAction: string;
    confidence: "high" | "medium" | "low";
    citedPlaceIds: string[];
    citedSignalSources: string[];
    citedFactLabels: string[];
  }[];
};

export type MomentCardClient = {
  generate(
    request: MomentCardGenerationRequest,
    signal?: AbortSignal
  ): Promise<MomentCardPayload | null>;
};

type AttachMomentCardsOptions = {
  client?: MomentCardClient;
  profileApplied?: RecommendResponse["meta"]["profileApplied"];
  timeoutMs?: number;
};

function timeWindowText(timeWindow: RecommendInput["timeWindow"]) {
  if (timeWindow === "now") return "现在";
  if (timeWindow === "tonight") return "今晚";
  return "这个周末";
}

function truncate(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function firstSignal(route: RecommendedRoute) {
  return route.sourceSignals[0];
}

function factLabels(route: RecommendedRoute) {
  return [...new Set((route.momentFit?.facts ?? []).map((fact) => fact.label).filter(Boolean))];
}

function confidenceFor(route: RecommendedRoute): MomentRecommendationCard["confidence"] {
  const hasHighTrustPlace = route.evidence?.placeChecks.some((check) => check.confidence >= 0.75);
  const hasFreshness = (route.evidence?.sourceFreshness.length ?? 0) > 0;
  const hasMoment = Boolean(route.momentFit?.whyNow);

  if (hasHighTrustPlace && hasMoment && hasFreshness) {
    return "high";
  }

  if (hasHighTrustPlace || hasMoment) {
    return "medium";
  }

  return "low";
}

export function buildLocalMomentCard(
  route: RecommendedRoute,
  input: RecommendInput
): MomentRecommendationCard {
  const firstPlace = route.places[0];
  const secondPlace = route.places[1];
  const signal = firstSignal(route);
  const timing = route.momentFit?.facts[0];
  const destination = firstPlace?.name ?? route.title;
  const nextStop = secondPlace?.name ? `，再去 ${secondPlace.name}` : "";
  const signalLabel = signal?.label ?? "已入库城市信号";
  const routeTime = route.traffic.estimatedDurationMinutes;
  const citedFactLabels = factLabels(route);

  return {
    headline: truncate(`${timeWindowText(input.timeWindow)}去 ${destination}`, 34),
    message: truncate(
      route.momentFit?.whyNow
        ? `${route.momentFit.whyNow} 路线约 ${routeTime} 分钟${nextStop}。`
        : `${destination}${nextStop} 和你的 ${input.interests.slice(0, 3).join("、") || "城市探索"} 偏好贴合，路线约 ${routeTime} 分钟。`,
      170
    ),
    primaryReason: truncate(
      signal?.evidence
        ? `${signalLabel}：${signal.evidence}`
        : route.reason || `${signalLabel} 支撑这条路线。`,
      90
    ),
    timingHint: timing ? truncate(`${timing.label}: ${timing.value}`, 70) : undefined,
    nextAction: truncate(
      route.traffic.provider === "amap"
        ? "按地图路线出发，现场再微调停留时间。"
        : "先确认交通与营业状态，再按推荐顺序出发。",
      50
    ),
    confidence: confidenceFor(route),
    generatedBy: "template",
    citedPlaceIds: firstPlace ? [firstPlace.id] : [],
    citedSignalSources: signal?.source ? [signal.source] : [],
    citedFactLabels
  };
}

function routeFacts(routes: RecommendedRoute[]): MomentCardRouteFact[] {
  return routes.map((route) => ({
    id: route.id,
    title: route.title,
    summary: route.summary,
    reason: route.reason,
    trafficMinutes: route.traffic.estimatedDurationMinutes,
    trafficProvider: route.traffic.provider,
    places: route.places.map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      tags: place.tags,
      source: place.source
    })),
    sourceSignals: route.sourceSignals.map((signal) => ({
      source: signal.source,
      label: signal.label,
      evidence: signal.evidence
    })),
    momentFit: route.momentFit
      ? {
          whyNow: route.momentFit.whyNow,
          facts: route.momentFit.facts
        }
      : undefined,
    evidence: route.evidence
      ? {
          signalRoles: route.evidence.signalRoles,
          caveats: route.evidence.caveats
        }
      : undefined
  }));
}

function cardRequest(
  routes: RecommendedRoute[],
  input: RecommendInput,
  profileApplied?: RecommendResponse["meta"]["profileApplied"]
): MomentCardGenerationRequest {
  return {
    input: {
      city: input.city,
      area: input.area,
      interests: input.interests,
      mood: input.mood,
      budget: input.budget,
      timeWindow: input.timeWindow
    },
    profileApplied,
    routes: routeFacts(routes)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function parseMomentCardPayload(value: unknown): MomentCardPayload | null {
  if (!isRecord(value) || !Array.isArray(value.routes)) {
    return null;
  }

  const routes = value.routes.flatMap((item): MomentCardPayload["routes"] => {
    if (!isRecord(item)) {
      return [];
    }

    const routeId = typeof item.routeId === "string" ? item.routeId.trim() : "";
    const headline = typeof item.headline === "string" ? item.headline.trim() : "";
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const primaryReason = typeof item.primaryReason === "string" ? item.primaryReason.trim() : "";
    const timingHint = typeof item.timingHint === "string" && item.timingHint.trim()
      ? item.timingHint.trim()
      : undefined;
    const nextAction = typeof item.nextAction === "string" ? item.nextAction.trim() : "";
    const confidence = item.confidence;

    if (
      !routeId ||
      !headline ||
      !message ||
      !primaryReason ||
      !nextAction ||
      (confidence !== "high" && confidence !== "medium" && confidence !== "low")
    ) {
      return [];
    }

    return [
      {
        routeId,
        headline,
        message,
        primaryReason,
        timingHint,
        nextAction,
        confidence,
        citedPlaceIds: stringArray(item.citedPlaceIds),
        citedSignalSources: stringArray(item.citedSignalSources),
        citedFactLabels: stringArray(item.citedFactLabels)
      }
    ];
  });

  return { routes };
}

const MOMENT_CARD_SCHEMA = {
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
          headline: { type: "string" },
          message: { type: "string" },
          primaryReason: { type: "string" },
          timingHint: { type: "string" },
          nextAction: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          citedPlaceIds: { type: "array", items: { type: "string" } },
          citedSignalSources: { type: "array", items: { type: "string" } },
          citedFactLabels: { type: "array", items: { type: "string" } }
        },
        required: [
          "routeId",
          "headline",
          "message",
          "primaryReason",
          "nextAction",
          "confidence",
          "citedPlaceIds",
          "citedSignalSources",
          "citedFactLabels"
        ]
      }
    }
  },
  required: ["routes"]
};

const MOMENT_CARD_INSTRUCTIONS = [
  "你是 CitySense 的城市提醒卡文案层，只能基于输入 JSON 中的路线事实写中文行动建议。",
  "不要新增地点、活动、天气、交通、价格、时间、URL 或来源；不能改变路线顺序、排序或可达性判断。",
  "headline 写成一句短建议，message 写成像朋友提醒一样的具体行动句，primaryReason 写可信理由，nextAction 写下一步动作。",
  "每张卡必须引用同一路线内的 places[].id、sourceSignals[].source，以及 momentFit.facts[].label（若该路线存在 facts）。",
  "citedPlaceIds / citedSignalSources / citedFactLabels 只能来自同一个 route；不得引用 sourceContext 或路线外信息。",
  "文案要克制、具体，不使用营销口吻，不假装掌握未提供的实时状态。"
].join("\n");

function adaptSharedMomentCardClient(client: OpenAiCompatibleClient): MomentCardClient {
  return {
    async generate(request, signal) {
      const text = await client.completeJsonOrNull({
        instructions: MOMENT_CARD_INSTRUCTIONS,
        schema: MOMENT_CARD_SCHEMA,
        userPayload: request,
        maxTokens: 1_000,
        signal
      });

      return text ? parseMomentCardPayload(JSON.parse(text)) : null;
    }
  };
}

function createDefaultMomentCardClient(): MomentCardClient | undefined {
  const shared = createLlmClient({
    modelEnv: "CITYSENSE_MOMENT_CARD_MODEL",
    defaultModel: DEFAULT_OPENAI_MODEL
  });

  return shared ? adaptSharedMomentCardClient(shared) : undefined;
}

function cardText(card: Omit<MomentRecommendationCard, "generatedBy">) {
  return [
    card.headline,
    card.message,
    card.primaryReason,
    card.timingHint ?? "",
    card.nextAction
  ].join("\n");
}

function includesUrl(text: string) {
  return /https?:\/\//i.test(text);
}

export function isGroundedMomentCard(
  route: RecommendedRoute,
  card: Omit<MomentRecommendationCard, "generatedBy">
) {
  const placeIds = new Set(route.places.map((place) => place.id));
  const placeNames = route.places.map((place) => place.name).filter(Boolean);
  const signalSources = new Set(route.sourceSignals.map((signal) => signal.source));
  const availableFactLabels = new Set(factLabels(route));
  const text = cardText(card);

  if (
    card.headline.length > 42 ||
    card.message.length > 190 ||
    card.primaryReason.length > 110 ||
    (card.timingHint?.length ?? 0) > 90 ||
    card.nextAction.length > 70 ||
    includesUrl(text)
  ) {
    return false;
  }

  if (
    card.citedPlaceIds.length === 0 ||
    card.citedPlaceIds.some((placeId) => !placeIds.has(placeId))
  ) {
    return false;
  }

  if (
    signalSources.size > 0 &&
    (card.citedSignalSources.length === 0 ||
      card.citedSignalSources.some((source) => !signalSources.has(source)))
  ) {
    return false;
  }

  if (
    availableFactLabels.size > 0 &&
    (card.citedFactLabels.length === 0 ||
      card.citedFactLabels.some((label) => !availableFactLabels.has(label)))
  ) {
    return false;
  }

  return placeNames.some((name) => text.includes(name));
}

function mergeMomentCards(
  routes: RecommendedRoute[],
  payload: MomentCardPayload | null,
  input: RecommendInput
) {
  const localRoutes = routes.map((route) => ({
    ...route,
    momentCard: buildLocalMomentCard(route, input)
  }));

  if (!payload) {
    return localRoutes;
  }

  const cards = new Map(payload.routes.map((card) => [card.routeId, card]));

  return localRoutes.map((route) => {
    const card = cards.get(route.id);

    if (!card || !isGroundedMomentCard(route, card)) {
      return route;
    }

    return {
      ...route,
      momentCard: {
        headline: card.headline,
        message: card.message,
        primaryReason: card.primaryReason,
        timingHint: card.timingHint,
        nextAction: card.nextAction,
        confidence: card.confidence,
        generatedBy: "llm" as const,
        citedPlaceIds: card.citedPlaceIds,
        citedSignalSources: card.citedSignalSources,
        citedFactLabels: card.citedFactLabels
      }
    };
  });
}

export async function attachMomentCards(
  routes: RecommendedRoute[],
  input: RecommendInput,
  options: AttachMomentCardsOptions = {}
) {
  const client = options.client ?? createDefaultMomentCardClient();

  if (!client) {
    return mergeMomentCards(routes, null, input);
  }

  const timeoutMs = options.timeoutMs ?? llmTimeoutMs("CITYSENSE_MOMENT_CARD_TIMEOUT_MS", DEFAULT_LLM_TIMEOUT_MS);

  try {
    const payload = await withLlmTimeout({
      timeoutMs,
      task: (signal) => client.generate(cardRequest(routes, input, options.profileApplied), signal)
    });

    return mergeMomentCards(routes, payload, input);
  } catch {
    return mergeMomentCards(routes, null, input);
  }
}

export const __testing = {
  buildLocalMomentCard,
  isGroundedMomentCard,
  parseMomentCardPayload,
  mergeMomentCards
};
