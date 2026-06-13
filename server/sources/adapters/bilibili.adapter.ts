import { createMcpSourceAdapter } from "@/server/sources/adapters/mcp-source.adapter";

export const bilibiliAdapter = createMcpSourceAdapter({
  source: "bilibili",
  urlEnvVar: "BILIBILI_MCP_URL",
  tokenEnvVar: "BILIBILI_MCP_TOKEN"
});
