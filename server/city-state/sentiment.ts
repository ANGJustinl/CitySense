import {
  createLlmClient,
  llmTimeoutMs,
  withLlmTimeout
} from "@/server/ai/llm-client";
import type { OpenAiCompatibleClient } from "@/server/ai/llm-client";
import type { CityConditionDraft } from "@/server/city-state/types";

export type SentimentLabel = "calm" | "hyped" | "noisy" | "neutral";

export type SentimentSample = {
  tag?: string | null;
  heatScore?: number | null;
  source?: string | null;
  metadata?: unknown;
};

export type SentimentLlmClient = {
  classify(
    input: {
      city: string;
      area?: string;
      ruleLabel: SentimentLabel;
      samples: {
        tag: string;
        heatScore: number;
        source: string;
      }[];
    },
    signal?: AbortSignal
  ): Promise<{
    label: SentimentLabel;
    score: number;
    confidence: number;
    reason?: string;
  } | null>;
};

const SENTIMENT_TTL_MS = 90 * 60 * 1000;
const DEFAULT_LLM_TIMEOUT_MS = 4_000;
const MIN_LLM_SAMPLE_COUNT = 6;

const SENTIMENT_LABELS = new Set<SentimentLabel>(["calm", "hyped", "noisy", "neutral"]);

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeSample(sample: SentimentSample) {
  return {
    tag: sample.tag ?? "",
    heatScore: typeof sample.heatScore === "number" ? sample.heatScore : 50,
    source: sample.source ?? "database"
  };
}

function scoreByKeywords(samples: ReturnType<typeof normalizeSample>[]) {
  const scores: Record<SentimentLabel, number> = {
    calm: 0,
    hyped: 0,
    noisy: 0,
    neutral: 0
  };

  for (const sample of samples) {
    const text = sample.tag.toLowerCase();
    const heat = Math.max(1, sample.heatScore);

    if (/安静|书店|展览|美术馆|公园|散步|咖啡|独处|solo|文化/.test(text)) {
      scores.calm += heat;
    } else if (/演出|市集|快闪|热门|排队|音乐节|新店|首展|限定|livehouse/i.test(text)) {
      scores.hyped += heat;
    } else if (/夜生活|酒吧|派对|club|livehouse|嘈杂|人多/i.test(text)) {
      scores.noisy += heat;
    } else {
      scores.neutral += heat * 0.65;
    }
  }

  return scores;
}

function dominantLabel(scores: Record<SentimentLabel, number>): SentimentLabel {
  return (Object.entries(scores) as [SentimentLabel, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
}

function labelText(label: SentimentLabel) {
  if (label === "calm") return "偏松弛";
  if (label === "hyped") return "热度上扬";
  if (label === "noisy") return "偏嘈杂";
  return "中性";
}

function scoreForLabel(label: SentimentLabel, scores: Record<SentimentLabel, number>) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const share = total > 0 ? scores[label] / total : 0.25;

  if (label === "calm") return clamp(48 + share * 38);
  if (label === "hyped") return clamp(58 + share * 38);
  if (label === "noisy") return clamp(42 + share * 40);
  return 55;
}

export function estimateRuleBasedSentiment(input: {
  city: string;
  area?: string;
  samples: SentimentSample[];
  now?: Date;
}): CityConditionDraft {
  const now = input.now ?? new Date();
  const normalized = input.samples.map(normalizeSample);
  const scores = scoreByKeywords(normalized);
  const label = dominantLabel(scores);
  const sampleCount = normalized.length;

  return {
    city: input.city,
    area: input.area,
    condition: "sentiment",
    score: scoreForLabel(label, scores),
    label: labelText(label),
    source: "citysense-sentiment-rules",
    confidence: Math.min(0.78, 0.35 + Math.log10(Math.max(1, sampleCount)) * 0.22),
    metadata: {
      label,
      sampleCount,
      scores
    },
    capturedAt: now,
    expiresAt: new Date(now.getTime() + SENTIMENT_TTL_MS)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLlmPayload(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const label = typeof value.label === "string" ? value.label : "";
  const score = typeof value.score === "number" ? value.score : Number(value.score);
  const confidence = typeof value.confidence === "number" ? value.confidence : Number(value.confidence);

  if (!SENTIMENT_LABELS.has(label as SentimentLabel) || !Number.isFinite(score) || !Number.isFinite(confidence)) {
    return null;
  }

  return {
    label: label as SentimentLabel,
    score: clamp(score),
    confidence: Math.max(0, Math.min(0.92, confidence)),
    reason: typeof value.reason === "string" ? value.reason.slice(0, 160) : undefined
  };
}

const SENTIMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: {
      enum: ["calm", "hyped", "noisy", "neutral"]
    },
    score: {
      type: "number"
    },
    confidence: {
      type: "number"
    },
    reason: {
      type: "string"
    }
  },
  required: ["label", "score", "confidence", "reason"]
};

const SENTIMENT_INSTRUCTIONS = [
  "Classify the current city mood from trend samples only.",
  "Return one label: calm, hyped, noisy, or neutral.",
  "Do not invent locations, facts, or live crowd data. Keep confidence between 0 and 1."
].join("\n");

function adaptSharedSentimentClient(client: OpenAiCompatibleClient): SentimentLlmClient {
  return {
    async classify(input, signal) {
      const text = await client.completeJsonOrNull({
        instructions: SENTIMENT_INSTRUCTIONS,
        schema: SENTIMENT_SCHEMA,
        userPayload: input,
        maxTokens: 220,
        signal
      });

      return text ? parseLlmPayload(JSON.parse(text)) : null;
    }
  };
}

function createDefaultSentimentClient() {
  const shared = createLlmClient({
    modelEnv: "CITY_STATE_SENTIMENT_MODEL",
    defaultModel: "glm-4.6"
  });

  return shared ? adaptSharedSentimentClient(shared) : undefined;
}

export async function resolveSentimentCondition(
  input: {
    city: string;
    area?: string;
    samples: SentimentSample[];
    now?: Date;
  },
  options: {
    client?: SentimentLlmClient;
    timeoutMs?: number;
    minSampleCount?: number;
  } = {}
): Promise<CityConditionDraft> {
  const rule = estimateRuleBasedSentiment(input);
  const normalized = input.samples.map(normalizeSample).filter((sample) => sample.tag);
  const minSampleCount = options.minSampleCount ?? MIN_LLM_SAMPLE_COUNT;
  const client = options.client ?? createDefaultSentimentClient();

  if (!client || normalized.length < minSampleCount) {
    return rule;
  }

  try {
    const enhanced = await withLlmTimeout({
      timeoutMs: options.timeoutMs ?? llmTimeoutMs("CITY_STATE_SENTIMENT_TIMEOUT_MS", DEFAULT_LLM_TIMEOUT_MS),
      task: (signal) =>
        client.classify(
          {
            city: input.city,
            area: input.area,
            ruleLabel: (rule.metadata?.label as SentimentLabel | undefined) ?? "neutral",
            samples: normalized.slice(0, 20)
          },
          signal
        )
    });

    if (!enhanced) {
      return rule;
    }

    return {
      ...rule,
      score: enhanced.score,
      label: labelText(enhanced.label),
      source: "citysense-sentiment-llm",
      confidence: Math.max(rule.confidence, enhanced.confidence),
      metadata: {
        ...rule.metadata,
        label: enhanced.label,
        llmEnhanced: true,
        llmReason: enhanced.reason
      }
    };
  } catch {
    return rule;
  }
}

export const __testing = {
  estimateRuleBasedSentiment,
  resolveSentimentCondition
};
