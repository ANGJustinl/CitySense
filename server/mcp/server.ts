/**
 * CitySense MCP server.
 *
 * Exposes CitySense's recommendation & data capabilities as MCP tools so any
 * MCP-compatible agent (Claude Desktop, Cursor, Claude Code, ...) can drive
 * them. Runs as a standalone `tsx` process over stdio; it does NOT depend on
 * the Next.js runtime — every tool delegates directly to the pure functions
 * under `server/`, which talk to Postgres (Prisma) and AMap directly.
 *
 * Run:
 *   pnpm mcp:server            # stdio (default; for local agents)
 *
 * Env: loaded from `.env` by the launcher (Node's `--env-file=.env` flag,
 * see the `mcp:server` script in package.json). Required:
 *   DATABASE_URL      required by recommend / route-detail / city-pulse /
 *                     ingest-status / feedback (Prisma connection)
 *   AMAP_API_KEY      optional; enables real-time ETA in resolve_traffic
 *   REDIS_URL         not required by this server itself (only by the ingest
 *                     worker; enqueueIngestRun is intentionally NOT exposed)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import { registerRecommendTool } from "@/server/mcp/tools/recommend";
import { registerRouteDetailTool } from "@/server/mcp/tools/route-detail";
import { registerCityPulseTool } from "@/server/mcp/tools/city-pulse";
import { registerIngestStatusTool } from "@/server/mcp/tools/ingest-status";
import { registerTrafficTool } from "@/server/mcp/tools/traffic";
import { registerFeedbackTool } from "@/server/mcp/tools/feedback";
import { registerListSourcesTool } from "@/server/mcp/tools/sources";

const SERVER_NAME = "citysense-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Build a configured McpServer with all CitySense tools registered. Exported
 * so tests can connect an in-memory client without spawning a subprocess.
 */
export function createCitySenseMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // Read-mostly / generation tools (safe surface)
  registerRecommendTool(server);
  registerRouteDetailTool(server);
  registerCityPulseTool(server);
  registerIngestStatusTool(server);
  registerTrafficTool(server);
  registerListSourcesTool(server);

  // Write tool (closes the feedback loop)
  registerFeedbackTool(server);

  return server;
}

async function main() {
  const server = createCitySenseMcpServer();
  const transport = new StdioServerTransport();

  // Any server-side logs must go to stderr — stdout is reserved for the MCP
  // JSON-RPC protocol and would corrupt the client stream.
  await server.connect(transport);

  process.stderr.write(
    `[${SERVER_NAME} v${SERVER_VERSION}] listening on stdio. tools: recommend_routes, get_route_detail, get_city_pulse, get_ingest_status, resolve_traffic, record_feedback, list_sources\n`
  );
}

// Only auto-start when invoked directly (not when imported by tests).
// Use pathToFileURL so the comparison is correct on Windows (D:\... vs
// file:///D:/...) and with tsx's rewritten argv[1].
const entryUrl = pathToFileURL(process.argv[1] ?? "").href;
const isMainEntry = import.meta.url === entryUrl;
if (isMainEntry) {
  main().catch((error) => {
    process.stderr.write(`citysense-mcp failed to start: ${String(error)}\n`);
    process.exit(1);
  });
}
