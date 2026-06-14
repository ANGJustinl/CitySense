/**
 * CitySense MCP server — HTTP (Streamable HTTP) transport.
 *
 * Remote counterpart to `server/mcp/server.ts` (stdio). Lets external agents
 * connect from their own machines over HTTP, authenticated by a single static
 * bearer token (MCP_API_TOKEN). Designed to run behind a TLS-terminating
 * reverse proxy (nginx/Caddy) when exposed publicly.
 *
 * Stateless mode: each request gets a fresh transport + McpServer. No session
 * map, no SSE long-poll — fine for CitySense because all 7 tools are simple
 * request/response and never push server-initiated notifications.
 *
 * Run:
 *   pnpm mcp:http
 *
 * Env (loaded via the launcher's `--env-file=.env`):
 *   MCP_API_TOKEN   REQUIRED. Static bearer token shared with remote callers.
 *                   The server refuses to start if unset (so it can never be
 *                   exposed publicly without auth).
 *   MCP_HOST        Bind host. Defaults to 0.0.0.0 (listen on all interfaces).
 *   MCP_PORT        Bind port. Defaults to 18070.
 *   DATABASE_URL    Required by the DB-backed tools (same as stdio server).
 *   AMAP_API_KEY    Optional; enables real-time ETA in resolve_traffic.
 */
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { Express, Request as ExpressRequest, Response as ExpressResponse } from "express";

import { createCitySenseMcpServer } from "@/server/mcp/server";

const SERVER_NAME = "citysense-mcp-http";
const SERVER_VERSION = "0.1.0";
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 18070;
// Far-future epoch seconds. requireBearerAuth rejects tokens without a numeric
// expiresAt, so a static token must claim it never expires.
const STATIC_TOKEN_EXPIRES_AT = 9_999_999_999;

/**
 * Constant-time string comparison to avoid leaking token length / prefix via
 * timing side channels. Both sides must be the same length for the crypto
 * comparison; we fall back to a plain !== check (which still doesn't match)
 * when lengths differ, after normalizing the timing.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    // Still do a (meaningless) comparison to keep timing uniform.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Build an OAuthTokenVerifier that accepts exactly one static token from env.
 * Exported so tests can construct a verifier against a known test token.
 */
export function createStaticTokenVerifier(token: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(received: string): Promise<AuthInfo> {
      if (!constantTimeEquals(received, token)) {
        throw new InvalidTokenError("Invalid access token");
      }

      return {
        token: received,
        clientId: "static",
        scopes: [],
        expiresAt: STATIC_TOKEN_EXPIRES_AT
      };
    }
  };
}

/**
 * Build a configured express app with the /mcp routes wired. Exported so tests
 * can listen on an ephemeral port and exercise the full HTTP path.
 */
export function createMcpHttpApp(token: string): Express {
  const app = createMcpExpressApp();
  const verifier = createStaticTokenVerifier(token);
  const authMiddleware = requireBearerAuth({ verifier });

  app.post("/mcp", authMiddleware, async (req: ExpressRequest, res: ExpressResponse) => {
    const server = createCitySenseMcpServer();

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      // Stateless: tear down once the response is sent.
      req.on("close", () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
    } catch (error) {
      console.error(`[${SERVER_NAME}] request failed:`, error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  // Stateless mode does not support the GET (SSE) or DELETE (session end)
  // methods — respond with the JSON-RPC method-not-allowed error.
  const methodNotAllowed = (_req: ExpressRequest, res: ExpressResponse) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      })
    );
  };

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

async function main() {
  const token = process.env.MCP_API_TOKEN?.trim();

  if (!token) {
    console.error(
      `[${SERVER_NAME}] refusing to start: MCP_API_TOKEN is not set.\n` +
        "Generate one (e.g. `openssl rand -hex 32`), put it in .env as MCP_API_TOKEN, " +
        "and share it with the remote callers who need access."
    );
    process.exit(1);
  }

  const host = process.env.MCP_HOST || DEFAULT_HOST;
  const port = Number(process.env.MCP_PORT) || DEFAULT_PORT;
  const app = createMcpHttpApp(token);

  app.listen(port, host, () => {
    console.log(
      `[${SERVER_NAME} v${SERVER_VERSION}] listening on http://${host}:${port}/mcp\n` +
        `  auth: bearer token (MCP_API_TOKEN, ${token.length} chars)\n` +
        `  tools: recommend_routes, get_route_detail, get_city_pulse, get_ingest_status, resolve_traffic, record_feedback, list_sources\n` +
        `  expose publicly ONLY behind a TLS-terminating reverse proxy.`
    );
  });
}

const entryUrl = pathToFileURL(process.argv[1] ?? "").href;
const isMainEntry = import.meta.url === entryUrl;

if (isMainEntry) {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start:`, error);
    process.exit(1);
  });
}
