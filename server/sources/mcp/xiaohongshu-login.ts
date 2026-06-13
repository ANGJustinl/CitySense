import { callMcpToolRaw, type McpRawToolResult } from "@/server/sources/mcp/mcp-client";

let xiaohongshuLoginMcpLock: Promise<unknown> = Promise.resolve();

export type XiaohongshuLoginQrcodeResponse =
  | {
      status: "ok";
      message: string;
      imageDataUrl: string;
      expiresAt?: string;
    }
  | {
      status: "not_configured" | "tool_error" | "invalid_payload";
      error: string;
      message?: string;
    };

export type XiaohongshuLoginStatusResponse = {
  status: "logged_in" | "not_logged_in" | "unknown";
  message: string;
  requiresVerificationCode: boolean;
  rawText?: string;
};

export type XiaohongshuVerificationCodeResponse =
  | {
      status: "ok" | "not_logged_in";
      message: string;
      loggedIn: boolean;
      username?: string;
      rawText?: string;
    }
  | {
      status: "not_configured" | "tool_error" | "invalid_payload";
      error: string;
      message?: string;
      rawText?: string;
    };

function textParts(result: unknown) {
  const content = result && typeof result === "object" ? (result as { content?: unknown }).content : undefined;

  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((part): part is { type: "text"; text: string } => {
      if (!part || typeof part !== "object") {
        return false;
      }

      return (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string";
    })
    .map((part) => part.text);
}

function imagePart(result: unknown) {
  const content = result && typeof result === "object" ? (result as { content?: unknown }).content : undefined;

  if (!Array.isArray(content)) {
    return undefined;
  }

  return content.find((part): part is { type: "image"; data: string; mimeType?: string } => {
    if (!part || typeof part !== "object") {
      return false;
    }

    return (part as { type?: unknown }).type === "image" && typeof (part as { data?: unknown }).data === "string";
  });
}

function parseShanghaiExpiry(text: string) {
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);

  if (!match) {
    return undefined;
  }

  return `${match[1]}T${match[2]}+08:00`;
}

function rawError(result: McpRawToolResult): XiaohongshuLoginQrcodeResponse {
  return {
    status: result.status === "ok" ? "tool_error" : result.status,
    error: result.error ?? `${result.connector} ${result.tool} failed`
  };
}

function rawVerificationError(result: McpRawToolResult): XiaohongshuVerificationCodeResponse {
  return {
    status: result.status === "ok" ? "tool_error" : result.status,
    error: result.error ?? `${result.connector} ${result.tool} failed`
  };
}

function isToolError(result: unknown) {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

function hasVerificationCodePrompt(text: string) {
  return /验证码|短信|人机|安全验证|verification/i.test(text);
}

export function withXiaohongshuLoginMcpLock<T>(operation: () => Promise<T>) {
  const run = xiaohongshuLoginMcpLock.catch(() => undefined).then(operation);
  xiaohongshuLoginMcpLock = run.catch(() => undefined);
  return run;
}

export function normalizeXiaohongshuLoginQrcode(
  result: unknown
): XiaohongshuLoginQrcodeResponse {
  const message = textParts(result)[0] ?? "";
  const image = imagePart(result);

  if (!image?.data) {
    return {
      status: "invalid_payload",
      error: "Xiaohongshu MCP login QR image is missing",
      message
    };
  }

  return {
    status: "ok",
    message,
    imageDataUrl: `data:${image.mimeType ?? "image/png"};base64,${image.data}`,
    expiresAt: parseShanghaiExpiry(message)
  };
}

export function normalizeXiaohongshuLoginStatus(result: unknown): XiaohongshuLoginStatusResponse {
  const rawText = textParts(result).join("\n").trim();

  if (rawText.includes("未登录")) {
    return {
      status: "not_logged_in",
      message: rawText,
      requiresVerificationCode: hasVerificationCodePrompt(rawText),
      rawText
    };
  }

  if (rawText.includes("已登录")) {
    return {
      status: "logged_in",
      message: rawText,
      requiresVerificationCode: false,
      rawText
    };
  }

  return {
    status: "unknown",
    message: rawText || "无法判断小红书登录状态",
    requiresVerificationCode: hasVerificationCodePrompt(rawText),
    rawText: rawText || undefined
  };
}

export function normalizeXiaohongshuVerificationCodeSubmission(
  result: unknown
): XiaohongshuVerificationCodeResponse {
  const rawText = textParts(result).join("\n").trim();

  if (isToolError(result) || rawText.includes("提交验证码失败")) {
    return {
      status: "tool_error",
      error: rawText || "验证码提交失败",
      message: rawText || undefined,
      rawText: rawText || undefined
    };
  }

  if (!rawText) {
    return {
      status: "invalid_payload",
      error: "Xiaohongshu MCP verification response text is missing"
    };
  }

  const loggedIn = /当前登录状态[:：]\s*true/i.test(rawText);
  const username = rawText.match(/用户名[:：]\s*(.+)$/m)?.[1]?.trim();

  return {
    status: loggedIn ? "ok" : "not_logged_in",
    message: rawText,
    loggedIn,
    username: username || undefined
  };
}

export async function getXiaohongshuLoginQrcode() {
  return withXiaohongshuLoginMcpLock(async () => {
    const result = await callMcpToolRaw({
      connector: "xiaohongshu",
      tool: "get_login_qrcode",
      input: {},
      config: {
        url: process.env.XIAOHONGSHU_MCP_URL,
        token: process.env.XIAOHONGSHU_MCP_TOKEN,
        timeoutMs: 60_000
      }
    });

    if (result.status !== "ok") {
      return rawError(result);
    }

    return normalizeXiaohongshuLoginQrcode(result.data);
  });
}

export async function getXiaohongshuLoginStatus() {
  return withXiaohongshuLoginMcpLock(async () => {
    const result = await callMcpToolRaw({
      connector: "xiaohongshu",
      tool: "check_login_status",
      input: {},
      config: {
        url: process.env.XIAOHONGSHU_MCP_URL,
        token: process.env.XIAOHONGSHU_MCP_TOKEN,
        timeoutMs: 60_000
      }
    });

    if (result.status !== "ok") {
      return {
        status: "unknown" as const,
        message: result.error ?? "小红书登录状态检查失败",
        requiresVerificationCode: false
      };
    }

    return normalizeXiaohongshuLoginStatus(result.data);
  });
}

export async function submitXiaohongshuLoginVerificationCode(code: unknown) {
  const normalizedCode = typeof code === "string" || typeof code === "number" ? String(code).trim() : "";

  if (!normalizedCode) {
    return {
      status: "invalid_payload" as const,
      error: "验证码不能为空"
    };
  }

  return withXiaohongshuLoginMcpLock(async () => {
    const result = await callMcpToolRaw({
      connector: "xiaohongshu",
      tool: "submit_login_verification_code",
      input: {
        code: normalizedCode
      },
      config: {
        url: process.env.XIAOHONGSHU_MCP_URL,
        token: process.env.XIAOHONGSHU_MCP_TOKEN,
        timeoutMs: 60_000
      }
    });

    if (result.status !== "ok") {
      return rawVerificationError(result);
    }

    return normalizeXiaohongshuVerificationCodeSubmission(result.data);
  });
}
