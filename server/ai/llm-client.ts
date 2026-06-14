/**
 * Shared OpenAI-compatible Chat Completions client.
 *
 * All CitySense LLM callers (ingest normalizer, place-match reviewer, route
 * explainer) talk to the same OpenAI-compatible endpoint (configured via
 * OPENAI_BASE_URL / OPENAI_API_BASE / API_BASE) and use the same request shape
 * (system+user messages, json_object response_format, temperature 0). This
 * module centralizes that logic so the three callers only provide their
 * task-specific instructions / schema / response parser.
 *
 * The provider is GLM by default (glm-4.6 / glm-4-flash). The client uses the
 * Chat Completions API path (`/chat/completions`), not the OpenAI Responses API
 * path (`/responses`) which GLM does not implement.
 */

import { resolveOpenAiBaseUrl } from "@/server/ai/openai-config";

type FetchLike = typeof fetch;

export type LlmClientOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchFn?: FetchLike;
};

export type JsonCompletionInput = {
  /** System-prompt instructions for the task. */
  instructions: string;
  /** User message payload (usually a JSON-serialized request object). */
  userPayload: unknown;
  /** Optional JSON schema description appended to the system prompt. */
  schema?: unknown;
  /** Max output tokens. Defaults to 1000. */
  maxTokens?: number;
  /** Optional abort signal (e.g. from a timeout wrapper). */
  signal?: AbortSignal;
};

/**
 * Extracts the assistant text from either a Chat Completions response
 * (`choices[0].message.content`) or a legacy Responses-API response
 * (`output_text` / `output[].content[].text`). The Responses-API path is kept
 * as a fallback so the module stays portable if a deployment ever points at the
 * real OpenAI Responses endpoint.
 */
export function extractLlmOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  // Chat Completions API: choices[0].message.content
  const choices = (value as { choices?: unknown[] }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as { message?: { content?: unknown } })?.message;
    const content = message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }

  // Responses API fallback: output_text
  const outputText = (value as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  // Responses API fallback: output[].content[].text
  const output = (value as { output?: unknown[] }).output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const contents = (item as { content?: unknown[] }).content;
      if (!Array.isArray(contents)) continue;
      for (const content of contents) {
        if (content && typeof content === "object") {
          const text = (content as { text?: unknown }).text;
          if (typeof text === "string") chunks.push(text);
        }
      }
    }
    if (chunks.length) return chunks.join("").trim() || null;
  }

  return null;
}

export class OpenAiCompatibleClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: FetchLike;

  constructor(options: LlmClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Sends a system+user chat-completions request that asks for a JSON object
   * response and returns the raw assistant text (caller parses to JSON).
   * Throws an Error with the HTTP status if the request fails.
   */
  async completeJson(input: JsonCompletionInput): Promise<string> {
    const text = await this.requestJsonText(input);

    if (!text) {
      throw new Error("LLM returned an empty response");
    }

    return text;
  }

  /**
   * Same as completeJson but tolerates an empty response (returns null instead
   * of throwing). Useful when the caller wants to fall back gracefully.
   */
  async completeJsonOrNull(input: JsonCompletionInput): Promise<string | null> {
    return this.requestJsonText(input);
  }

  private async requestJsonText(input: JsonCompletionInput): Promise<string | null> {
    const systemContent = input.schema
      ? `${input.instructions}\n\nReturn JSON matching this schema:\n${JSON.stringify(input.schema)}`
      : input.instructions;

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: input.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: typeof input.userPayload === "string" ? input.userPayload : JSON.stringify(input.userPayload) }
        ],
        response_format: { type: "json_object" },
        max_tokens: input.maxTokens ?? 1_000,
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data: unknown = await response.json();
    return extractLlmOutputText(data);
  }
}

/**
 * Runs an async task with an abort timeout. Resolves with the task result, or
 * rejects with "timed out" if the timeout fires first. All three callers use
 * this same pattern (AbortController + Promise.race), so it is centralized here.
 */
export async function withLlmTimeout<T>(input: {
  task: (signal: AbortSignal) => Promise<T>;
  timeoutMs: number;
}): Promise<T> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      input.task(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("LLM call timed out"));
        }, input.timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Factory: builds a client from the standard OPENAI_* env vars. Returns
 * undefined when OPENAI_API_KEY is not configured, so callers can fall back to
 * deterministic / local behavior.
 *
 * @param modelEnv    Optional per-task model env var (e.g.
 *   CITYSENSE_PLACE_MATCH_MODEL), taking precedence over OPENAI_MODEL.
 * @param defaultModel Default model when no env var is set.
 * @param fetchFn      Optional fetch override (for tests).
 */
export function createLlmClient(input: {
  modelEnv?: string;
  defaultModel: string;
  fetchFn?: FetchLike;
}): OpenAiCompatibleClient | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const model = input.modelEnv
    ? process.env[input.modelEnv]?.trim() || process.env.OPENAI_MODEL?.trim() || input.defaultModel
    : process.env.OPENAI_MODEL?.trim() || input.defaultModel;

  return new OpenAiCompatibleClient({
    apiKey,
    baseUrl: resolveOpenAiBaseUrl(),
    model,
    fetchFn: input.fetchFn ?? fetch
  });
}

/** Parses a numeric env var with a positive-value floor, for timeout configuration. */
export function llmTimeoutMs(envVar: string, fallback: number): number {
  const parsed = Number(process.env[envVar]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
