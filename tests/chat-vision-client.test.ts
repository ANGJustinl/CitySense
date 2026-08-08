import assert from "node:assert/strict";
import test from "node:test";
import {
  createChatClient,
  type ChatMessage,
  type ChatStreamEvent
} from "@/server/ai/chat-client";

/**
 * 视觉(多模态)聊天客户端测试。
 *
 * 验证:当 user 消息携带 image_url 多模态 content 时,
 * 请求体被正确序列化为 OpenAI/智谱通用格式(text + image_url 片段数组),
 * 且 SSE 解析逻辑与纯文本客户端一致(复用同一实现)。
 */

/** 构造一个返回给定 SSE 文本块的假 fetch,并捕获请求体。 */
function captureFetch(chunks: string[]) {
  const encoder = new TextEncoder();
  let capturedBody: unknown = undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  const fetchFn = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body && typeof init.body === "string") {
      try {
        capturedBody = JSON.parse(init.body);
      } catch {
        capturedBody = init.body;
      }
    }
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
  };
  return { fetchFn, getBody: () => capturedBody };
}

function sseDelta(content?: string) {
  const delta: Record<string, unknown> = {};
  if (content !== undefined) delta.content = content;
  const choice: Record<string, unknown> = { delta };
  return `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
}

async function drain(events: AsyncGenerator<ChatStreamEvent>) {
  const out: ChatStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

test("多模态 user 消息序列化为 content 数组(text + image_url)", async () => {
  const { fetchFn, getBody } = captureFetch([sseDelta("这是一只猫"), "data: [DONE]\n\n"]);
  const client = createChatClient({ apiKey: "k", baseUrl: "https://x", model: "glm-4.5v", fetchFn });

  const multimodalUser: ChatMessage = {
    role: "user",
    content: [
      { type: "text", text: "这张图里是什么?" },
      { type: "image_url", image_url: { url: "https://cdn.example.com/a.webp" } }
    ]
  };

  await drain(client.streamChatCompletion({ messages: [multimodalUser] }));

  const body = getBody() as { messages: ChatMessage[] };
  assert.equal(body.messages[0].role, "user");
  assert.ok(Array.isArray(body.messages[0].content), "content 应为数组");
  const parts = body.messages[0].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[0].text, "这张图里是什么?");
  assert.equal(parts[1].type, "image_url");
  assert.equal(parts[1].image_url?.url, "https://cdn.example.com/a.webp");
});

test("纯图消息(无 text 片段)也合法序列化", async () => {
  const { fetchFn, getBody } = captureFetch([sseDelta("看不清"), "data: [DONE]\n\n"]);
  const client = createChatClient({ apiKey: "k", baseUrl: "https://x", model: "glm-4.5v", fetchFn });

  const imageOnlyUser: ChatMessage = {
    role: "user",
    content: [{ type: "image_url", image_url: { url: "https://cdn.example.com/b.webp" } }]
  };

  await drain(client.streamChatCompletion({ messages: [imageOnlyUser] }));

  const body = getBody() as { messages: ChatMessage[] };
  const parts = body.messages[0].content as Array<{ type: string }>;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, "image_url");
});

test("纯文本 user 消息保持字符串 content(不受多模态类型影响)", async () => {
  const { fetchFn, getBody } = captureFetch([sseDelta("你好"), "data: [DONE]\n\n"]);
  const client = createChatClient({ apiKey: "k", baseUrl: "https://x", model: "glm-4-flash", fetchFn });

  const textUser: ChatMessage = { role: "user", content: "你好" };
  await drain(client.streamChatCompletion({ messages: [textUser] }));

  const body = getBody() as { messages: ChatMessage[] };
  assert.equal(body.messages[0].content, "你好");
  assert.equal(typeof body.messages[0].content, "string");
});

test("视觉模型 SSE 解析与文本客户端一致(delta 正常产出)", async () => {
  const { fetchFn } = captureFetch([sseDelta("图里"), sseDelta("是一只"), sseDelta("柴犬"), "data: [DONE]\n\n"]);
  const client = createChatClient({ apiKey: "k", baseUrl: "https://x", model: "glm-4.5v", fetchFn });

  const events = await drain(
    client.streamChatCompletion({
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://x/b.webp" } }] }]
    })
  );

  const deltas = events.filter((e) => e.type === "delta");
  assert.equal(deltas.length, 3);
  assert.equal(deltas.map((d) => (d as { content: string }).content).join(""), "图里是一只柴犬");
});
