import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCitySenseMcpServer } from "@/server/mcp/server";
import { jsonResult, errorResult } from "@/server/mcp/tools/shared";

/**
 * The SDK's `callTool` return type widens `content` to a schema-inferred `{}`,
 * which is awkward to assert against. We narrow it once at the helper boundary.
 */
type TextContent = { type: "text"; text: string };
type NarrowedCallResult = {
  isError?: boolean;
  content: TextContent[];
};

function firstText(result: unknown): string {
  const narrowed = result as NarrowedCallResult;
  const first = narrowed.content?.[0];
  assert.ok(first && first.type === "text", "expected at least one text content part");
  return first.text;
}

function parseTextJson<T = unknown>(result: unknown): T {
  return JSON.parse(firstText(result)) as T;
}

/**
 * These tests connect a real MCP `Client` to the CitySense `McpServer` over an
 * in-memory transport pair — exercising the full JSON-RPC round-trip including
 * schema validation and the shared result wrappers.
 *
 * They are deliberately DB-free: tools that need Postgres are verified via the
 * DATABASE_URL guard (which returns a structured error without touching Prisma),
 * so the suite runs anywhere without a database.
 */

const EXPECTED_TOOL_NAMES = [
  "recommend_routes",
  "get_route_detail",
  "get_city_pulse",
  "get_ingest_status",
  "resolve_traffic",
  "record_feedback",
  "list_sources"
] as const;

async function withConnectedClient<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const server = createCitySenseMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "citysense-mcp-test", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

test("McpServer advertises all 7 CitySense tools", async () => {
  const tools = await withConnectedClient(async (client) => {
    const response = await client.listTools();
    return response.tools;
  });

  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(
    names,
    [...EXPECTED_TOOL_NAMES].sort(),
    "expected exactly the 7 registered tools"
  );

  // Every tool must declare a description and a non-empty inputSchema.
  for (const tool of tools) {
    assert.ok(tool.description, `tool ${tool.name} has no description`);
    assert.ok(
      tool.inputSchema && typeof tool.inputSchema === "object",
      `tool ${tool.name} has no inputSchema`
    );
  }
});

test("list_sources returns connector metadata without a database", async () => {
  const result = await withConnectedClient(async (client) =>
    client.callTool({ name: "list_sources", arguments: {} })
  );

  assert.equal((result as NarrowedCallResult).isError, undefined, "list_sources should not error");

  const payload = parseTextJson<{
    sources: { source: string; kind: string; status: string }[];
    count: number;
  }>(result);
  assert.ok(Array.isArray(payload.sources), "expected sources array");
  assert.equal(payload.count, payload.sources.length);

  // Every adapter must expose the three fields the tool promises.
  for (const entry of payload.sources) {
    assert.ok(entry.source, "source entry missing `source`");
    assert.ok(entry.kind, "source entry missing `kind`");
    assert.ok(entry.status, "source entry missing `status`");
  }
});

test("DB-dependent tools return a friendly DATABASE_URL error when unconfigured", async () => {
  // These tests run without DATABASE_URL in CI; if a developer happens to have
  // it set locally we skip rather than mock, since the guard is only meaningful
  // when the var is actually absent.
  if (process.env.DATABASE_URL) {
    return;
  }

  const result = await withConnectedClient(async (client) =>
    client.callTool({
      name: "get_city_pulse",
      arguments: { city: "上海" }
    })
  );

  assert.equal((result as NarrowedCallResult).isError, true, "expected isError flag");
  const payload = parseTextJson<{ error: string }>(result);
  assert.match(payload.error, /DATABASE_URL/i);
});

test("recommend_routes validates input and rejects bad mood", async () => {
  const result = await withConnectedClient(async (client) =>
    client.callTool({
      name: "recommend_routes",
      arguments: { city: "上海", mood: "not-a-real-mood" as unknown }
    })
  );

  // Zod validation failure is surfaced by the SDK as an error result before
  // the handler body runs.
  assert.equal((result as NarrowedCallResult).isError, true, "expected validation error");
});

test("shared.jsonResult / errorResult produce stable MCP content shapes", () => {
  const ok = jsonResult({ routes: [], meta: { generatedAt: "x" } });
  assert.equal(ok.isError, undefined);
  assert.equal(ok.content.length, 1);
  assert.equal(ok.content[0].type, "text");
  assert.deepEqual(JSON.parse((ok.content[0] as TextContent).text), {
    routes: [],
    meta: { generatedAt: "x" }
  });

  const err = errorResult(new Error("boom"));
  assert.equal(err.isError, true);
  assert.deepEqual(JSON.parse((err.content[0] as TextContent).text), {
    error: "boom"
  });
});
