export type McpToolCall = {
  connector: string;
  tool: string;
  input: unknown;
};

export async function callMcpTool(call: McpToolCall) {
  return {
    connector: call.connector,
    tool: call.tool,
    status: "not_configured" as const,
    data: null
  };
}
