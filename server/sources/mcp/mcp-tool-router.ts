import { callMcpTool } from "@/server/sources/mcp/mcp-client";

export async function routeCitySignalTool(input: {
  connector: string;
  city: string;
  keywords: string[];
}) {
  return callMcpTool({
    connector: input.connector,
    tool: "search_city_signals",
    input
  });
}
