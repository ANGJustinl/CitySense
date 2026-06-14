import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveTrafficInfo } from "@/server/maps/traffic";
import { runTool } from "./shared";

/**
 * `resolve_traffic`
 *
 * Estimate or look up real-time traffic info (duration / distance / congestion)
 * between two points. Mirrors `POST /api/amap/route`. Uses AMap when
 * `AMAP_API_KEY` is set and cached snapshot is fresh; otherwise falls back to
 * haversine estimation.
 */
const pointSchema = z.object({
  lat: z.number().finite().describe("Latitude (GCJ-02 / AMap coordinate system)."),
  lng: z.number().finite().describe("Longitude (GCJ-02 / AMap coordinate system).")
});

const inputSchema = {
  origin: pointSchema.describe("Origin coordinate."),
  destination: pointSchema.describe("Destination coordinate."),
  mode: z
    .enum(["walking", "transit", "driving"])
    .optional()
    .describe("Travel mode. Defaults to transit."),
  city: z
    .string()
    .optional()
    .describe("City context for the AMap routing call. Defaults to 上海.")
} satisfies Record<string, z.ZodType>;

export function registerTrafficTool(server: McpServer) {
  server.registerTool(
    "resolve_traffic",
    {
      title: "Resolve traffic ETA",
      description:
        "Estimate or look up real-time traffic (duration in minutes, distance in meters, congestion level) between two coordinates. Uses AMap Web API when AMAP_API_KEY is configured, else falls back to straight-line estimation. Results may be cached as TrafficSnapshot rows.",
      inputSchema,
      annotations: {
        readOnlyHint: false, // may write a TrafficSnapshot on cache miss
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ origin, destination, mode, city }) => {
      return runTool(() =>
        resolveTrafficInfo({
          city: city ?? "上海",
          origin,
          destination,
          mode: mode ?? "transit",
          useRealtimeTraffic: true
        })
      );
    }
  );
}
