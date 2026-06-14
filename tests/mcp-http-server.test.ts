import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo, Server } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createMcpHttpApp,
  createStaticTokenVerifier
} from "@/server/mcp/http-server";

/**
 * HTTP-transport tests for the remote MCP server.
 *
 * Each test starts `createMcpHttpApp()` on an ephemeral port and connects a
 * real SDK `Client` over `StreamableHTTPClientTransport` — exercising the full
 * HTTP round-trip including the bearer-auth middleware.
 */

const TEST_TOKEN = "test-token-abcdef0123456789";

async function withHttpServer<T>(
  fn: (baseUrl: string, close: () => Promise<void>) => Promise<T>
): Promise<T> {
  const app = createMcpHttpApp(TEST_TOKEN);
  const server: Server = await new Promise((resolve) => {
    const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    return await fn(baseUrl, async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function connectClient(
  baseUrl: string,
  token: string | null
): Promise<Client> {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers }
  });
  const client = new Client({ name: "mcp-http-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

test("missing Authorization header is rejected with 401", async () => {
  await withHttpServer(async (baseUrl) => {
    await assert.rejects(
      () => connectClient(baseUrl, null),
      (error: unknown) => {
        // SDK surfaces 401 as StreamableHTTPError with the status code.
        const code = (error as { code?: number }).code;
        return code === 401;
      },
      "expected connect() without token to fail with 401"
    );
  });
});

test("wrong token is rejected with 401", async () => {
  await withHttpServer(async (baseUrl) => {
    await assert.rejects(
      () => connectClient(baseUrl, "definitely-wrong-token"),
      (error: unknown) => (error as { code?: number }).code === 401,
      "expected connect() with wrong token to fail with 401"
    );
  });
});

test("correct token connects and lists all 7 tools", async () => {
  await withHttpServer(async (baseUrl, close) => {
    const client = await connectClient(baseUrl, TEST_TOKEN);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        "get_city_pulse",
        "get_ingest_status",
        "get_route_detail",
        "list_sources",
        "recommend_routes",
        "record_feedback",
        "resolve_traffic"
      ]);
    } finally {
      await client.close();
      await close();
    }
  });
});

test("correct token can call list_sources (no DB needed)", async () => {
  await withHttpServer(async (baseUrl, close) => {
    const client = await connectClient(baseUrl, TEST_TOKEN);
    try {
      const result = await client.callTool({
        name: "list_sources",
        arguments: {}
      });
      assert.equal((result as { isError?: boolean }).isError, undefined);

      const text = (result.content as unknown as { text: string }[])[0].text;
      const payload = JSON.parse(text) as {
        sources: { source: string; kind: string; status: string }[];
        count: number;
      };
      assert.ok(payload.count >= 1, "expected at least one source");
    } finally {
      await client.close();
      await close();
    }
  });
});

test("createStaticTokenVerifier returns far-future expiry (required by bearerAuth)", async () => {
  const verifier = createStaticTokenVerifier(TEST_TOKEN);
  const authInfo = await verifier.verifyAccessToken(TEST_TOKEN);
  assert.equal(authInfo.clientId, "static");
  assert.equal(authInfo.expiresAt, 9_999_999_999);
  assert.ok(authInfo.expiresAt > Date.now() / 1000);

  await assert.rejects(
    () => verifier.verifyAccessToken("wrong"),
    (error: unknown) => /invalid/i.test((error as Error).message),
    "wrong token should be rejected"
  );
});

test("GET /mcp returns 405 (stateless mode has no SSE)", async () => {
  await withHttpServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "GET" });
    assert.equal(res.status, 405);
  });
});
