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
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
  137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
  532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719,
  1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666,
  6667, 6668, 6669, 6697, 10080
]);

async function closeServer(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function listenOnFetchSafePort() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const app = createMcpHttpApp(TEST_TOKEN);
    const server: Server = await new Promise((resolve) => {
      const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
    });
    const { port } = server.address() as AddressInfo;

    if (!FETCH_BLOCKED_PORTS.has(port)) {
      return { server, port };
    }

    await closeServer(server);
  }

  throw new Error("Unable to allocate a fetch-safe ephemeral port for MCP HTTP tests");
}

async function withHttpServer<T>(
  fn: (baseUrl: string, close: () => Promise<void>) => Promise<T>
): Promise<T> {
  const { server, port } = await listenOnFetchSafePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }

    closed = true;
    await closeServer(server);
  };

  try {
    return await fn(baseUrl, close);
  } finally {
    await close();
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
