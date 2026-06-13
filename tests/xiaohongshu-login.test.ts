import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeXiaohongshuLoginQrcode,
  normalizeXiaohongshuLoginStatus,
  normalizeXiaohongshuVerificationCodeSubmission,
  withXiaohongshuLoginMcpLock
} from "@/server/sources/mcp/xiaohongshu-login";

test("xiaohongshu login qrcode normalizer extracts text and image data url", () => {
  const result = normalizeXiaohongshuLoginQrcode({
    content: [
      {
        type: "text",
        text: "请用小红书 App 在 2026-06-13 15:34:51 前扫码登录 👇"
      },
      {
        type: "image",
        data: "abc123",
        mimeType: "image/png"
      }
    ]
  });

  assert.equal(result.status, "ok");
  assert.equal(result.message, "请用小红书 App 在 2026-06-13 15:34:51 前扫码登录 👇");
  assert.equal(result.imageDataUrl, "data:image/png;base64,abc123");
  assert.equal(result.expiresAt, "2026-06-13T15:34:51+08:00");
});

test("xiaohongshu login qrcode normalizer rejects missing image payload", () => {
  const result = normalizeXiaohongshuLoginQrcode({
    content: [{ type: "text", text: "missing image" }]
  });

  assert.equal(result.status, "invalid_payload");
  assert.match(result.error ?? "", /QR image/);
});

test("xiaohongshu login status normalizer classifies login text", () => {
  assert.deepEqual(
    normalizeXiaohongshuLoginStatus({
      content: [{ type: "text", text: "✅ 已登录\n\n用户：CitySense" }]
    }),
    {
      status: "logged_in",
      message: "✅ 已登录\n\n用户：CitySense",
      requiresVerificationCode: false,
      rawText: "✅ 已登录\n\n用户：CitySense"
    }
  );

  assert.deepEqual(
    normalizeXiaohongshuLoginStatus({
      content: [{ type: "text", text: "❌ 未登录\n\n请使用 get_login_qrcode 工具获取二维码进行登录。" }]
    }),
    {
      status: "not_logged_in",
      message: "❌ 未登录\n\n请使用 get_login_qrcode 工具获取二维码进行登录。",
      requiresVerificationCode: false,
      rawText: "❌ 未登录\n\n请使用 get_login_qrcode 工具获取二维码进行登录。"
    }
  );

  assert.deepEqual(
    normalizeXiaohongshuLoginStatus({
      content: [{ type: "text", text: "请完成短信验证码验证后继续登录" }]
    }),
    {
      status: "unknown",
      message: "请完成短信验证码验证后继续登录",
      requiresVerificationCode: true,
      rawText: "请完成短信验证码验证后继续登录"
    }
  );
});

test("xiaohongshu verification code submission normalizer extracts success state", () => {
  const result = normalizeXiaohongshuVerificationCodeSubmission({
    content: [
      {
        type: "text",
        text: "✅ 验证码提交成功，当前登录状态：true\n 用户名: CitySense"
      }
    ]
  });

  assert.deepEqual(result, {
    status: "ok",
    message: "✅ 验证码提交成功，当前登录状态：true\n 用户名: CitySense",
    loggedIn: true,
    username: "CitySense"
  });
});

test("xiaohongshu verification code submission normalizer reports tool failures", () => {
  const result = normalizeXiaohongshuVerificationCodeSubmission({
    isError: true,
    content: [
      {
        type: "text",
        text: "提交验证码失败: 验证码错误或已过期"
      }
    ]
  });

  assert.equal(result.status, "tool_error");
  assert.match(result.error ?? "", /验证码错误/);
});

test("xiaohongshu login MCP calls are serialized", async () => {
  const events: string[] = [];
  let releaseFirstCall: (() => void) | undefined;

  const firstCall = withXiaohongshuLoginMcpLock(async () => {
    events.push("first:start");
    await new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });
    events.push("first:end");
    return "first";
  });

  const secondCall = withXiaohongshuLoginMcpLock(async () => {
    events.push("second:start");
    return "second";
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["first:start"]);

  releaseFirstCall?.();

  assert.equal(await firstCall, "first");
  assert.equal(await secondCall, "second");
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});
