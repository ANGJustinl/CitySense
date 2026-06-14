import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRouteDetail } from "@/server/routes/route-detail";
import { requireDatabaseUrl, runTool } from "./shared";

/**
 * `get_route_detail`
 *
 * Reads a route snapshot written by `recommend_routes`. Mirrors
 * `GET /api/routes/:id`. Returns the route, the original recommendation input,
 * and a map view (polyline + markers) for rendering.
 */
const inputSchema = {
  routeId: z
    .string()
    .min(1)
    .describe(
      "Route snapshot id of the form `${recommendationId}__${routeLocalId}`, as returned by recommend_routes."
    )
} satisfies Record<string, z.ZodType>;

export function registerRouteDetailTool(server: McpServer) {
  server.registerTool(
    "get_route_detail",
    {
      title: "Get route detail",
      description:
        "Read a route snapshot by id. Returns the route, the original recommendation input, and a map view (polyline + markers). Use a routeId returned by recommend_routes.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ routeId }) => {
      const dbGuard = requireDatabaseUrl();
      if (dbGuard) {
        return dbGuard;
      }

      return runTool(async () => {
        const detail = await getRouteDetail(routeId);
        if (!detail) {
          throw new Error(`Route not found: ${routeId}`);
        }
        return detail;
      });
    }
  );
}
