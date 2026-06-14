import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCityPulse } from "@/server/recommendation/city-pulse";
import { requireDatabaseUrl, runTool } from "./shared";

/**
 * `get_city_pulse`
 *
 * Returns aggregated city signals for the CityPulse dashboard: top tags,
 * source mix, traffic cache summary, feedback trend, ranker mix. Mirrors
 * `GET /api/city-pulse`. Safe to call frequently; never blocks on DB errors.
 */
const inputSchema = {
  city: z.string().describe("City name in Chinese. Defaults to 上海."),
  area: z.string().optional().describe("Optional district/area filter.")
} satisfies Record<string, z.ZodType>;

export function registerCityPulseTool(server: McpServer) {
  server.registerTool(
    "get_city_pulse",
    {
      title: "Get city pulse",
      description:
        "Aggregate city signals for a city/area: top tags, source mix (xiaohongshu / damai / amap-poi / ...), traffic cache summary, feedback trend, and ranker usage mix. Useful for understanding what's currently hot before recommending.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ city, area }) => {
      const dbGuard = requireDatabaseUrl();
      if (dbGuard) {
        return dbGuard;
      }

      return runTool(() => getCityPulse({ city: city ?? "上海", area }));
    }
  );
}
