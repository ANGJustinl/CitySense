import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Wrap a tool handler result into MCP content payload.
 * All CitySense MCP tools return JSON-as-text so any agent can consume them.
 */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Wrap a thrown error into an MCP error result. Stack traces are never leaked
 * to the agent — only a short, stable message is returned.
 */
export function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message })
      }
    ]
  };
}

/**
 * Run a tool handler with uniform success/error wrapping. Every tool delegates
 * to an existing `server/` function and never throws to the MCP runtime.
 */
export async function runTool<T>(
  operation: () => Promise<T>
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return jsonResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * Guard for tools that need a database. Returns a friendly message instead of
 * letting Prisma blow up with a connection error when the MCP server is run
 * without `DATABASE_URL` configured.
 */
export function requireDatabaseUrl(): CallToolResult | null {
  if (process.env.DATABASE_URL) {
    return null;
  }

  return errorResult(
    new Error(
      "DATABASE_URL is not configured. The CitySense MCP server needs a Postgres connection (see .env.example)."
    )
  );
}
