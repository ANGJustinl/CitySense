const MAX_ERROR_DETAIL_LENGTH = 240;

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isHtml(value: string) {
  return /^\s*(?:<!doctype\s+html|<html|<head|<body)\b/i.test(value);
}

function responseErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return compactText(record.error);
  if (typeof record.message === "string" && record.message.trim()) return compactText(record.message);
  return undefined;
}

function truncate(value: string) {
  return value.length > MAX_ERROR_DETAIL_LENGTH
    ? `${value.slice(0, MAX_ERROR_DETAIL_LENGTH - 1)}…`
    : value;
}

export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text().catch(() => "");
  const text = raw.trim();
  let body: unknown;
  let isJson = false;

  if (text) {
    try {
      body = JSON.parse(text);
      isJson = true;
    } catch {
      // Proxies and platform errors may return plain text or HTML instead of JSON.
    }
  }

  const status = `HTTP ${response.status}`;

  if (!response.ok) {
    const apiMessage = isJson ? responseErrorMessage(body) : undefined;
    const plainMessage = !isJson && !isHtml(text) && !/^(?:\{|\[)/.test(text)
      ? truncate(compactText(text))
      : undefined;
    const detail = apiMessage || plainMessage;
    throw new Error(detail ? `${fallbackMessage}：${detail}（${status}）` : `${fallbackMessage}（${status}）`);
  }

  if (!isJson) {
    throw new Error(`${fallbackMessage}：服务返回格式异常（${status}）`);
  }

  return body as T;
}
