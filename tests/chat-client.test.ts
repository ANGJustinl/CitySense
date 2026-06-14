import assert from "node:assert/strict";
import test from "node:test";
import { createChatClient, type ChatMessage } from "@/server/ai/chat-client";
import { CHAT_TOOLS } from "@/server/ai/chat-tools";

/**
 * TASK-P2-004 chat-client SSE 解析测试。
 *
 * 通过 createChatClient 的 fetchFn 注入构造假 SSE 流,
 * 验证 delta 拼接、tool_calls 累积、[DONE] 收尾、错误降级。
 */

/** 构造一个返回给定 SSE 文本块的假 fetch。 */
function mockFetch(chunks: string[]) {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });

  return async () =>
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
}

/** 把一个 choices delta 包成 SSE data 行。 */
function sseDelta(content?: string, toolCalls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>, finishReason?: string | null) {
  const choice: Record<string, unknown> = {};

  if (content !== undefined || toolCalls || finishReason !== undefined) {
    const delta: Record<string, unknown> = {};
    if (content !== undefined) {
      delta.content = content;
    }
    if (toolCalls) {
      delta.tool_calls = toolCalls;
    }
    choice.delta = delta;
    if (finishReason !== undefined) {
      choice.finish_reason = finishReason;
    }
  }

  return `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
}

const SSE_DONE = "data: [DONE]\n\n";

async function drainEvents(gen: AsyncGenerator<{ type: string; [key: string]: unknown }>) {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  for await (const event of gen) {
    events.push(event);
  }

  return events;
}

test("chat-client streams delta content and finishes on [DONE]", async () => {
  const client = createChatClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "test-model",
    fetchFn: mockFetch([sseDelta("你好"), sseDelta("世界"), SSE_DONE])
  });

  const events = await drainEvents(
    client.streamChatCompletion({ messages: [{ role: "user", content: "hi" }] })
  );

  const deltas = events.filter((e) => e.type === "delta").map((e) => e.content);
  const done = events.find((e) => e.type === "done");

  assert.deepEqual(deltas, ["你好", "世界"]);
  assert.ok(done);
});

test("chat-client accumulates tool_calls split across chunks", async () => {
  // 模拟智谱流式:工具调用的 name 和 arguments 分多个 chunk 到达。
  const client = createChatClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "test-model",
    fetchFn: mockFetch([
      sseDelta(undefined, [{ index: 0, id: "call_1", function: { name: "recommend_routes" } }]),
      sseDelta(undefined, [{ index: 0, function: { arguments: '{"interests":' } }]),
      sseDelta(undefined, [{ index: 0, function: { arguments: '["咖啡"]}' } }]),
      sseDelta(undefined, undefined, "tool_calls"),
      SSE_DONE
    ])
  });

  const events = await drainEvents(
    client.streamChatCompletion({ messages: [{ role: "user", content: "推荐" }] })
  );

  const toolEvent = events.find((e) => e.type === "tool_calls") as
    | { type: "tool_calls"; calls: NonNullable<ChatMessage["tool_calls"]> }
    | undefined;

  assert.ok(toolEvent, "should emit tool_calls event");
  assert.equal(toolEvent!.calls.length, 1);
  assert.equal(toolEvent!.calls[0].function.name, "recommend_routes");
  assert.equal(toolEvent!.calls[0].function.arguments, '{"interests":["咖啡"]}');
  assert.equal(toolEvent!.calls[0].id, "call_1");
});

test("chat-client yields done with finishReason when stream ends without [DONE]", async () => {
  const client = createChatClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "test-model",
    fetchFn: mockFetch([sseDelta("ok"), sseDelta(undefined, undefined, "stop")])
  });

  const events = await drainEvents(
    client.streamChatCompletion({ messages: [{ role: "user", content: "hi" }] })
  );

  const done = events.find((e) => e.type === "done") as { type: "done"; finishReason: string | null } | undefined;

  assert.ok(done);
  assert.equal(done!.finishReason, "stop");
});

test("chat-client surfaces HTTP error from non-ok response", async () => {
  const client = createChatClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "test-model",
    fetchFn: async () => new Response("internal error", { status: 500 })
  });

  const events = await drainEvents(
    client.streamChatCompletion({ messages: [{ role: "user", content: "hi" }] })
  );

  const err = events.find((e) => e.type === "error") as { type: "error"; message: string } | undefined;

  assert.ok(err);
  assert.ok(err!.message.includes("500"));
});

test("chat-client surfaces network error from fetch throw", async () => {
  const client = createChatClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "test-model",
    fetchFn: async () => {
      throw new Error("connection refused");
    }
  });

  const events = await drainEvents(
    client.streamChatCompletion({ messages: [{ role: "user", content: "hi" }] })
  );

  const err = events.find((e) => e.type === "error") as { type: "error"; message: string } | undefined;

  assert.ok(err);
  assert.ok(err!.message.includes("connection refused"));
});

test("CHAT_TOOLS defines 4 tools with required function metadata", () => {
  assert.equal(CHAT_TOOLS.length, 4);

  const names = CHAT_TOOLS.map((t) => t.function.name).sort();

  assert.deepEqual(names, ["get_city_pulse", "get_route_detail", "get_user_profile", "recommend_routes"]);

  for (const tool of CHAT_TOOLS) {
    assert.equal(tool.type, "function");
    assert.ok(tool.function.description.length > 10, `${tool.function.name} should have a description`);
    assert.ok(tool.function.parameters, `${tool.function.name} should have parameters`);
  }
});

test("recommend_routes tool marks routeId as required in get_route_detail", () => {
  const routeDetailTool = CHAT_TOOLS.find((t) => t.function.name === "get_route_detail");

  assert.ok(routeDetailTool);
  assert.deepEqual(routeDetailTool!.function.parameters.required, ["routeId"]);
});
