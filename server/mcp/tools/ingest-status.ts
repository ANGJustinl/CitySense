import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getIngestStatus } from "@/server/ingest/status";
import { requireDatabaseUrl, runTool } from "./shared";

/**
 * `get_ingest_status`
 *
 * Returns the status of source connectors and recent ingest runs. Mirrors
 * `GET /api/ingest/status`. Use to check which sources are active, in cooldown,
 * or errored — useful context before/after triggering a refresh.
 */
const inputSchema = {
  runId: z
    .string()
    .optional()
    .describe("Optional ingest run id to fetch a single run's detail.")
} satisfies Record<string, z.ZodType>;

export function registerIngestStatusTool(server: McpServer) {
  server.registerTool(
    "get_ingest_status",
    {
      title: "Get ingest status",
      description:
        "Return the status of all source connectors (xiaohongshu / damai / amap-poi / shanghai-gov / trends-hub / douban / bilibili) and recent ingest runs. Optionally fetch a single run by id. Use this to see which data sources are active, in cooldown, or errored.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ runId }) => {
      const dbGuard = requireDatabaseUrl();
      if (dbGuard) {
        return dbGuard;
      }

      return runTool(() => getIngestStatus(runId));
    }
  );
}
