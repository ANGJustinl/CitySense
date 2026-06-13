import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpToolStatus = "ok" | "not_configured" | "tool_error" | "invalid_payload";
export type McpConnectorTransport = "http" | "stdio";

export type McpConnectorConfig = {
  transport?: McpConnectorTransport;
  url?: string;
  token?: string;
  timeoutMs?: number;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpToolCall = {
  connector: string;
  tool: string;
  input: Record<string, unknown>;
  config?: McpConnectorConfig;
};

export type McpToolResult = {
  connector: string;
  tool: string;
  status: McpToolStatus;
  data: unknown;
  error?: string;
};

export type McpRawToolResult = {
  connector: string;
  tool: string;
  status: Exclude<McpToolStatus, "invalid_payload">;
  data: unknown;
  error?: string;
};

export type McpSdkClientLike = {
  connect(transport: unknown): Promise<void>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number }
  ): Promise<unknown>;
  close?(): Promise<void>;
};

export type McpClientDependencies = {
  createSdkClient?: () => McpSdkClientLike;
  createTransport?: (config: ResolvedMcpConnectorConfig) => unknown;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export type ResolvedMcpConnectorConfig = {
  transport: McpConnectorTransport;
  url: string;
  token: string;
  timeoutMs: number;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

function envPrefix(connector: string) {
  return connector.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function parseArgs(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Fall through to whitespace parsing for simple env configuration.
  }

  return value.split(/\s+/).filter(Boolean);
}

export function resolveMcpConnectorConfig(
  connector: string,
  config?: McpConnectorConfig
): ResolvedMcpConnectorConfig {
  const prefix = envPrefix(connector);
  const command = config?.command ?? process.env[`${prefix}_MCP_COMMAND`] ?? "";
  const transport = config?.transport ?? (command ? "stdio" : "http");

  return {
    transport,
    url: config?.url ?? process.env[`${prefix}_MCP_URL`] ?? "",
    token: config?.token ?? process.env[`${prefix}_MCP_TOKEN`] ?? "",
    timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    command,
    args: config?.args ?? parseArgs(process.env[`${prefix}_MCP_ARGS`]),
    env: config?.env
  };
}

function createDefaultSdkClient() {
  return new Client({
    name: "citysense-source-ingest",
    version: "0.1.0"
  });
}

function createDefaultTransport(config: ResolvedMcpConnectorConfig) {
  if (config.transport === "stdio") {
    const env = config.env ? { ...getDefaultEnvironment(), ...config.env } : undefined;

    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env
    });
  }

  const headers = config.token ? { Authorization: `Bearer ${config.token}` } : undefined;

  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: headers
      ? {
          headers
        }
      : undefined
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown mcp client error";
}

function parseTextContent(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractToolData(result: unknown) {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  if ("structuredContent" in result) {
    const structuredContent = (result as { structuredContent?: unknown }).structuredContent;
    if (structuredContent !== undefined) {
      return structuredContent;
    }
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if ((part as { type?: unknown }).type !== "text") {
      continue;
    }

    const text = (part as { text?: unknown }).text;
    if (typeof text !== "string") {
      continue;
    }

    const parsed = parseTextContent(text);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export async function callMcpTool(
  call: McpToolCall,
  dependencies: McpClientDependencies = {}
): Promise<McpToolResult> {
  const rawResult = await callMcpToolRaw(call, dependencies);

  if (rawResult.status !== "ok") {
    return rawResult;
  }

  const data = extractToolData(rawResult.data);

  if (data === undefined) {
    return {
      connector: call.connector,
      tool: call.tool,
      status: "invalid_payload",
      data: null,
      error: "MCP tool returned no JSON text content or structured content"
    };
  }

  return {
    connector: call.connector,
    tool: call.tool,
    status: "ok",
    data
  };
}

export async function callMcpToolRaw(
  call: McpToolCall,
  dependencies: McpClientDependencies = {}
): Promise<McpRawToolResult> {
  const config = resolveMcpConnectorConfig(call.connector, call.config);

  if (config.transport === "http" && !config.url) {
    return {
      connector: call.connector,
      tool: call.tool,
      status: "not_configured",
      data: null
    };
  }

  if (config.transport === "stdio" && !config.command) {
    return {
      connector: call.connector,
      tool: call.tool,
      status: "not_configured",
      data: null
    };
  }

  const client = dependencies.createSdkClient?.() ?? createDefaultSdkClient();
  const createTransport = dependencies.createTransport ?? createDefaultTransport;
  const transport = createTransport(config);

  try {
    await client.connect(transport as Transport);
    const result = await client.callTool(
      {
        name: call.tool,
        arguments: call.input
      },
      undefined,
      {
        timeout: config.timeoutMs
      }
    );

    return {
      connector: call.connector,
      tool: call.tool,
      status: "ok",
      data: result
    };
  } catch (error) {
    return {
      connector: call.connector,
      tool: call.tool,
      status: "tool_error",
      data: null,
      error: errorMessage(error)
    };
  } finally {
    await client.close?.().catch(() => undefined);
  }
}
