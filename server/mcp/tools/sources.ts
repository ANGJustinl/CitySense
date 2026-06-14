import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSourceAdapters } from "@/server/sources/source-registry";
import { runTool } from "./shared";

/**
 * `list_sources`
 *
 * Lists the registered source connectors and their runtime status. Pure
 * in-process call — does not hit the database, so safe to run regardless of
 * DATABASE_URL configuration. Useful as the first call to discover what data
 * sources CitySense currently knows about (xiaohongshu / damai / amap-poi /
 * shanghai-gov / trends-hub / douban / bilibili, plus mock in demo mode).
 */
const inputSchema = {} satisfies Record<string, z.ZodType>;

export function registerListSourcesTool(server: McpServer) {
  server.registerTool(
    "list_sources",
    {
      title: "List data sources",
      description:
        "List all registered CitySense source connectors with their kind (mcp / crawler / mock / ...) and current runtime status (active / not_configured / disabled). Does not require a database.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      return runTool(async () => {
        const adapters = getSourceAdapters();
        return {
          sources: adapters.map((adapter) => ({
            source: adapter.source,
            kind: adapter.kind,
            status: adapter.status
          })),
          count: adapters.length
        };
      });
    }
  );
}
