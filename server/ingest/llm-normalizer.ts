import { z } from "zod";
import {
  toNormalizedEntityInput,
  type NormalizedEntityInput
} from "@/server/ingest/normalize";
import {
  createLlmClient,
  llmTimeoutMs,
  OpenAiCompatibleClient,
  withLlmTimeout
} from "@/server/ai/llm-client";
import { canonicalizeArea, textMentionsArea } from "@/server/geo/area-normalizer";
import type { CandidateType } from "@/server/recommendation/types";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const DEFAULT_OPENAI_MODEL = "glm-4.6";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TAGS = 8;

export type LlmIngestNormalizeStatus =
  | "disabled"
  | "not_configured"
  | "llm_normalized"
  | "llm_ignored"
  | "invalid_payload"
  | "tool_error"
  | "timeout";

export type LlmIngestNormalizerRequest = {
  raw: {
    id: string;
    source: string;
    sourceId?: string;
    sourceUrl?: string;
    title: string;
    content?: string;
    author?: string;
    city?: string;
    area?: string;
    publishedAt?: string;
    itemType: CandidateType;
    address?: string;
    startsAt?: string;
    endsAt?: string;
    tags: string[];
    trendScore?: number;
    confidence?: number;
  };
  draft: NormalizedEntityInput | null;
};

export type LlmIngestNormalizerOutput = {
  status: "normalized" | "ignored";
  entityType?: CandidateType | null;
  title?: string | null;
  description?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tags?: string[] | null;
  trendScore?: number | null;
  confidence?: number | null;
  priceLevel?: number | null;
  quietness?: number | null;
  popularity?: number | null;
  ignoreReason?: string | null;
  reason?: string | null;
};

export type LlmIngestNormalizerClient = {
  normalize(
    request: LlmIngestNormalizerRequest,
    signal?: AbortSignal
  ): Promise<LlmIngestNormalizerOutput | null>;
};

export type LlmIngestNormalizeResult = {
  status: LlmIngestNormalizeStatus;
  entity: NormalizedEntityInput | null;
  draft: NormalizedEntityInput | null;
  output?: LlmIngestNormalizerOutput;
  ignoreReason?: string;
  error?: string;
  model?: string;
};

export type NormalizeSourceItemForIngestInput = {
  item: RawSourceItemDetail;
  sourceKey: string;
  client?: LlmIngestNormalizerClient;
  enabled?: boolean;
  timeoutMs?: number;
};

const llmOutputSchema = z.object({
  status: z.enum(["normalized", "ignored"]),
  entityType: z.enum(["event", "venue"]).nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  city: z.string().nullish(),
  area: z.string().nullish(),
  address: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  trendScore: z.number().nullish(),
  confidence: z.number().nullish(),
  priceLevel: z.number().nullish(),
  quietness: z.number().nullish(),
  popularity: z.number().nullish(),
  ignoreReason: z.string().nullish(),
  reason: z.string().nullish()
});

const LLM_NORMALIZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["normalized", "ignored"]
    },
    entityType: {
      type: ["string", "null"],
      enum: ["event", "venue", null]
    },
    title: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    area: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    startTime: { type: ["string", "null"] },
    endTime: { type: ["string", "null"] },
    tags: {
      type: ["array", "null"],
      items: { type: "string" }
    },
    trendScore: { type: ["number", "null"] },
    confidence: { type: ["number", "null"] },
    priceLevel: { type: ["number", "null"] },
    quietness: { type: ["number", "null"] },
    popularity: { type: ["number", "null"] },
    ignoreReason: { type: ["string", "null"] },
    reason: { type: ["string", "null"] }
  },
  required: [
    "status",
    "entityType",
    "title",
    "description",
    "city",
    "area",
    "address",
    "startTime",
    "endTime",
    "tags",
    "trendScore",
    "confidence",
    "priceLevel",
    "quietness",
    "popularity",
    "ignoreReason",
    "reason"
  ]
};

const LLM_NORMALIZE_INSTRUCTIONS = [
  "你是 CitySense 的城市信息入库解析器，只把 raw item 解析成面向公众的城市 event 或 venue。",
  "只能基于 raw 和 draft 中已有事实抽取，不要新增来源、URL、平台名或不存在的地点。",
  "source、sourceUrl、sourceKey、imageUrl 由系统保留，你不要改写来源身份。",
  "",
  "## 标题党识别规则（重要）",
  "以下情况必须返回 status=ignored：",
  "1. 标题纯夸张且内容无具体信息：如'上海生活简直是看展天花板'、'这家店绝了'、'绝绝子'、'必去'等夸张表达，且内容中没有具体的地点/活动名称",
  "2. 标题泛泛而谈且无具体内容：如'上海生活...'、'周末好去处'等泛化标题，但没有具体地点/活动信息",
  "3. 纯情感表达：如'太美了'、'爱了'等，无实际可参与的内容",
  "",
  "## 名称提取规则",
  "1. 优先从内容中提取具体的地点/活动名称，而非使用夸张的标题",
  "2. 如果标题包含具体名称（如'浦东美术馆新展：光与影的对话'），直接使用",
  "3. 如果标题有夸张前缀但内容有具体名称，使用内容中的名称",
  "",
  "## 正反示例",
  "✅ 应入库（normalized）：",
  "  - 标题：'浦东美术馆新展：光与影的对话' → title: '浦东美术馆新展：光与影的对话'",
  "  - 标题：'上海看展天花板！这个展太美了'，内容：'浦东美术馆新展：光与影的对话，展期至6月30日' → title: '浦东美术馆新展：光与影的对话'",
  "  - 标题：'星巴克臻选上海烘焙工坊' → title: '星巴克臻选上海烘焙工坊'",
  "",
  "❌ 应忽略（ignored）：",
  "  - 标题：'上海生活简直是看展天花板'，内容：'分享几个不错的展' → ignoreReason: '标题夸张且内容无具体展览名称'",
  "  - 标题：'静安寺这家咖啡店绝了'，内容：'宝藏店铺，值得一去' → ignoreReason: '标题夸张且内容无具体店名'",
  "  - 标题：'周末好去处'，内容：'推荐几个地方' → ignoreReason: '标题泛泛且无具体地点信息'",
  "",
  "## 其他规则",
  "如果内容不是面向公众可参与的活动、地点、展览、市集、咖啡、店铺、演出或城市体验，返回 status=ignored 并给出 ignoreReason。",
  "如果可以入库，返回 status=normalized，并尽量补齐 city、area、address、时间、tags、trendScore、confidence。",
  "tags 使用 2 到 8 个短标签；trendScore/confidence/popularity/quietness 使用 0 到 100；priceLevel 使用 1 到 4。",
  "输出必须是符合 JSON schema 的 JSON，不要输出解释性正文。"
].join("\n");

function trim(value?: string | null) {
  const text = value?.trim();

  return text || undefined;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseDate(value?: string | null) {
  const text = trim(value);

  if (!text) {
    return undefined;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeTags(value: unknown, fallback: string[]) {
  const tags = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const unique = [...new Set(tags)];

  return (unique.length > 0 ? unique : fallback).slice(0, MAX_TAGS);
}

function isFlagDisabled(value?: string) {
  const normalized = value?.trim().toLowerCase();

  return normalized === "false" || normalized === "0" || normalized === "off";
}

export function shouldUseLlmNormalizer(source: string) {
  if (isFlagDisabled(process.env.CITYSENSE_LLM_NORMALIZE_ENABLED)) {
    return false;
  }

  const sourceFilter = process.env.CITYSENSE_LLM_NORMALIZE_SOURCES?.trim();

  if (!sourceFilter || sourceFilter.toLowerCase() === "all") {
    return true;
  }

  return sourceFilter
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(source);
}

function createRequest(
  item: RawSourceItemDetail,
  draft: NormalizedEntityInput | null
): LlmIngestNormalizerRequest {
  return {
    raw: {
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      sourceUrl: item.sourceUrl,
      title: item.title,
      content: item.content,
      author: item.author,
      city: item.city,
      area: item.area,
      publishedAt: item.publishedAt,
      itemType: item.itemType,
      address: item.address,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      tags: item.tags,
      trendScore: item.trendScore,
      confidence: item.confidence
    },
    draft
  };
}

function fallbackScore(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function areaEvidenceText(input: {
  output: LlmIngestNormalizerOutput;
  item: RawSourceItemDetail;
}) {
  return [
    input.output.title,
    input.output.description,
    input.output.address,
    input.item.title,
    input.item.content,
    input.item.address
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function canTrustRawArea(item: RawSourceItemDetail, area: string) {
  return (
    item.source === "amap-poi" &&
    canonicalizeArea(item.area) === area &&
    typeof item.lat === "number" &&
    typeof item.lng === "number"
  );
}

function resolveEntityArea(input: {
  output: LlmIngestNormalizerOutput;
  item: RawSourceItemDetail;
  draft: NormalizedEntityInput | null;
}) {
  const area =
    canonicalizeArea(trim(input.output.area)) ??
    canonicalizeArea(input.draft?.area) ??
    canonicalizeArea(input.item.area);

  if (!area) {
    return undefined;
  }

  if (textMentionsArea(areaEvidenceText(input), area) || canTrustRawArea(input.item, area)) {
    return area;
  }

  return undefined;
}

function entityFromOutput(input: {
  output: LlmIngestNormalizerOutput;
  item: RawSourceItemDetail;
  sourceKey: string;
  draft: NormalizedEntityInput | null;
}) {
  const parsed = llmOutputSchema.parse(input.output);

  if (parsed.status === "ignored") {
    return {
      entity: null,
      ignoreReason: trim(parsed.ignoreReason) ?? "LLM marked item as irrelevant"
    };
  }

  const tags = normalizeTags(parsed.tags, []);
  const title = trim(parsed.title);
  const city = trim(parsed.city);
  const entityType = parsed.entityType;

  if (!entityType || !title || !city || tags.length === 0) {
    return null;
  }

  const entity: NormalizedEntityInput = {
    sourceKey: input.sourceKey,
    entityType,
    title,
    description: trim(parsed.description) ?? input.draft?.description ?? input.item.content,
    city,
    area: resolveEntityArea({
      output: parsed,
      item: input.item,
      draft: input.draft
    }),
    address: trim(parsed.address) ?? input.draft?.address ?? input.item.address,
    lat: input.draft?.lat ?? input.item.lat,
    lng: input.draft?.lng ?? input.item.lng,
    startTime: parseDate(parsed.startTime) ?? input.draft?.startTime,
    endTime: parseDate(parsed.endTime) ?? input.draft?.endTime,
    tags,
    source: input.item.source,
    sourceUrl: input.item.sourceUrl,
    imageUrl: input.item.imageUrl,
    trendScore: clamp(
      parsed.trendScore,
      0,
      100,
      fallbackScore(input.draft?.trendScore ?? input.item.trendScore, 0)
    ),
    confidence: clamp(
      parsed.confidence,
      0,
      100,
      fallbackScore(input.draft?.confidence ?? input.item.confidence, 60)
    ),
    priceLevel: parsed.priceLevel
      ? clamp(parsed.priceLevel, 1, 4, input.draft?.priceLevel ?? input.item.priceLevel ?? 2)
      : input.draft?.priceLevel ?? input.item.priceLevel,
    quietness: parsed.quietness
      ? clamp(parsed.quietness, 0, 100, input.draft?.quietness ?? input.item.quietness ?? 50)
      : input.draft?.quietness ?? input.item.quietness,
    popularity: parsed.popularity
      ? clamp(parsed.popularity, 0, 100, input.draft?.popularity ?? input.item.popularity ?? 50)
      : input.draft?.popularity ?? input.item.popularity,
    // qualityFlags is a system-reserved field: LLM cannot rewrite it.
    qualityFlags: input.draft?.qualityFlags ?? input.item.qualityFlags
  };

  return {
    entity,
    ignoreReason: undefined
  };
}

function createDefaultClient(): LlmIngestNormalizerClient | undefined {
  const shared = createLlmClient({ defaultModel: DEFAULT_OPENAI_MODEL });
  return shared ? adaptSharedClient(shared) : undefined;
}

/** Adapts the shared OpenAI-compatible client to the normalizer's interface. */
function adaptSharedClient(client: OpenAiCompatibleClient): LlmIngestNormalizerClient {
  return {
    async normalize(request, signal) {
      const text = await client.completeJsonOrNull({
        instructions: LLM_NORMALIZE_INSTRUCTIONS,
        schema: LLM_NORMALIZE_SCHEMA,
        userPayload: request,
        maxTokens: 1_000,
        signal
      });
      return text ? llmOutputSchema.parse(JSON.parse(text)) : null;
    }
  };
}

function errorStatus(error: unknown): Extract<LlmIngestNormalizeStatus, "timeout" | "tool_error"> {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("timed out"))
  ) {
    return "timeout";
  }

  return "tool_error";
}

export async function normalizeSourceItemForIngest(
  input: NormalizeSourceItemForIngestInput
): Promise<LlmIngestNormalizeResult> {
  const draft = toNormalizedEntityInput(input.item, input.sourceKey);
  const enabled = input.enabled ?? shouldUseLlmNormalizer(input.item.source);

  if (!enabled) {
    return {
      status: "disabled",
      entity: draft,
      draft
    };
  }

  const client = input.client ?? createDefaultClient();

  if (!client) {
    return {
      status: "not_configured",
      entity: draft,
      draft
    };
  }

  try {
    const request = createRequest(input.item, draft);
    const output = await withLlmTimeout({
      timeoutMs: input.timeoutMs ?? llmTimeoutMs("CITYSENSE_LLM_NORMALIZE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      task: (signal) => client.normalize(request, signal)
    });

    if (!output) {
      return {
        status: "invalid_payload",
        entity: draft,
        draft
      };
    }

    const parsed = entityFromOutput({
      output,
      item: input.item,
      sourceKey: input.sourceKey,
      draft
    });

    if (!parsed) {
      return {
        status: "invalid_payload",
        entity: draft,
        draft,
        output
      };
    }

    if (!parsed.entity) {
      return {
        status: "llm_ignored",
        entity: null,
        draft,
        output,
        ignoreReason: parsed.ignoreReason
      };
    }

    return {
      status: "llm_normalized",
      entity: parsed.entity,
      draft,
      output,
      ignoreReason: trim(output.reason),
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
    };
  } catch (error) {
    return {
      status: errorStatus(error),
      entity: draft,
      draft,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
