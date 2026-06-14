/**
 * CitySense AI 助手 — 流式 Chat Completions 客户端。
 *
 * TASK-P2-004:与现有 explain-route.ts(用智谱 coding/paas/v4 的 Responses API)隔离,
 * 使用智谱通用端点 paas/v4/chat/completions,支持 stream + tools(function calling)。
 *
 * 设计:
 * - 阶段 0 实测确认:glm-4-flash(免费)在 paas/v4 支持 stream + tools,格式与 OpenAI 100% 兼容。
 * - 流式响应通过 async generator 产出解析后的事件,delta/tool_call/done。
 * - AbortController + 超时控制;无 key 返回 undefined 触发降级。
 * - fetch-based,不引入 openai SDK(沿用项目模式)。
 */


const DEFAULT_CHAT_MODEL = "glm-4-flash";
const DEFAULT_CHAT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_CHAT_TIMEOUT_MS = 30_000;
const MAX_TOOL_ROUNDS = 3;

/** OpenAI/智谱兼容的 chat message 格式。 */
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/** 工具定义(OpenAI tools 格式)。 */
export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** 流式事件:增量内容 / 工具调用 / 完成 / 错误。 */
export type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_calls"; calls: NonNullable<ChatMessage["tool_calls"]> }
  | { type: "done"; finishReason: string | null }
  | { type: "error"; message: string };

type FetchLike = typeof fetch;

export interface ChatCompletionClient {
  /** 流式请求,返回事件 async generator。 */
  streamChatCompletion(input: {
    messages: ChatMessage[];
    tools?: ChatTool[];
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent, void, unknown>;
}

/** 助手会话上下文,从工作台传入,用于工具调用时携带推荐上下文。 */
export type ChatContext = {
  sessionId?: string;
  profileKey?: string;
  recommendationId?: string;
  city?: string;
  area?: string;
};

class ZhipuChatClient implements ChatCompletionClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: FetchLike;

  constructor(input: { apiKey: string; baseUrl: string; model: string; fetchFn?: FetchLike }) {
    this.apiKey = input.apiKey;
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.model = input.model;
    this.fetchFn = input.fetchFn ?? fetch;
  }

  async *streamChatCompletion({
    messages,
    tools,
    signal
  }: {
    messages: ChatMessage[];
    tools?: ChatTool[];
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    let response: Response;

    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "chat request failed"
      };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      yield {
        type: "error",
        message: `chat API ${response.status}: ${text.slice(0, 200)}`
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const accumulatedToolCalls: NonNullable<ChatMessage["tool_calls"]> = [];
    let finishReason: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE 按双换行分割事件块。
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed.startsWith("data:")) {
            continue;
          }

          const data = trimmed.slice(5).trim();

          if (data === "[DONE]") {
            // 流结束前,若有累积的工具调用,先产出。
            if (accumulatedToolCalls.length > 0) {
              yield { type: "tool_calls", calls: accumulatedToolCalls };
            }
            yield { type: "done", finishReason };
            return;
          }

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            };
            const choice = chunk.choices?.[0];

            if (!choice) {
              continue;
            }

            const delta = choice.delta;

            if (delta?.content) {
              yield { type: "delta", content: delta.content };
            }

            // 工具调用可能跨多个 chunk 累积(index 去重 + arguments 拼接)。
            if (delta?.tool_calls) {
              for (const call of delta.tool_calls) {
                const existing = accumulatedToolCalls[call.index];

                if (existing && call.function) {
                  if (call.function.name) {
                    existing.function.name = call.function.name;
                  }
                  if (call.function.arguments) {
                    existing.function.arguments += call.function.arguments;
                  }
                } else if (call.function) {
                  accumulatedToolCalls[call.index] = {
                    id: call.id ?? `call_${call.index}_${Date.now()}`,
                    type: "function",
                    function: {
                      name: call.function.name ?? "",
                      arguments: call.function.arguments ?? ""
                    }
                  };
                }
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          } catch {
            // 单行 JSON 解析失败跳过,不中断流。
          }
        }
      }

      // 流自然结束(未收到 [DONE])。
      if (accumulatedToolCalls.length > 0) {
        yield { type: "tool_calls", calls: accumulatedToolCalls };
      }
      yield { type: "done", finishReason };
    } catch (error) {
      if (signal?.aborted) {
        yield { type: "done", finishReason: "aborted" };
      } else {
        yield {
          type: "error",
          message: error instanceof Error ? error.message : "stream read failed"
        };
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * 创建默认 chat 客户端。无 OPENAI_API_KEY 时返回 undefined(触发降级)。
 *
 * 配置优先级:CHAT_LLM_BASE_URL / OPENAI_BASE_URL / 默认 paas/v4 通用端点。
 * 模型:CHAT_LLM_MODEL(默认 glm-4-flash,阶段 0 实测的免费可用模型)。
 */
export function createDefaultChatClient(): ChatCompletionClient | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const baseUrl =
    process.env.CHAT_LLM_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.OPENAI_API_BASE?.trim() ||
    process.env.API_BASE?.trim() ||
    DEFAULT_CHAT_BASE_URL;

  const model = process.env.CHAT_LLM_MODEL?.trim() || DEFAULT_CHAT_MODEL;

  return new ZhipuChatClient({ apiKey, baseUrl, model });
}

/** 供测试注入 mock fetch。 */
export function createChatClient(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchFn?: FetchLike;
}): ChatCompletionClient {
  return new ZhipuChatClient(input);
}

export const CHAT_MAX_TOOL_ROUNDS = MAX_TOOL_ROUNDS;
export const CHAT_DEFAULT_TIMEOUT_MS = DEFAULT_CHAT_TIMEOUT_MS;
export const CHAT_DEFAULT_MODEL = DEFAULT_CHAT_MODEL;
