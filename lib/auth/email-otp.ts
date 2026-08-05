export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_COOLDOWN_MS = 60_000;
export const EMAIL_OTP_PENDING_TTL_MS = 10 * 60_000;
export const PENDING_SIGNUP_STORAGE_KEY = "citysense:pending-signup:v1";

export type PendingSignup = {
  email: string;
  createdAt: number;
  resendAvailableAt: number;
};

export function sanitizeEmailOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, EMAIL_OTP_LENGTH);
}

export function validateEmailOtp(value: string) {
  return /^\d{6}$/.test(value) ? undefined : "请输入 6 位邮箱验证码。";
}

export function remainingCooldownSeconds(availableAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

export function parsePendingSignup(value: string | null, now = Date.now()): PendingSignup | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<PendingSignup>;
    if (
      typeof parsed.email !== "string" ||
      !parsed.email.includes("@") ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.resendAvailableAt !== "number" ||
      now - parsed.createdAt > EMAIL_OTP_PENDING_TTL_MS ||
      parsed.createdAt > now + 60_000
    ) return undefined;
    return {
      email: parsed.email,
      createdAt: parsed.createdAt,
      resendAvailableAt: parsed.resendAvailableAt
    };
  } catch {
    return undefined;
  }
}

export function emailOtpError(cause: unknown, operation: "verify" | "resend") {
  const error = cause as { code?: string; message?: string };
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (code.includes("expired") || message.includes("expired")) return "验证码已过期，请重新发送。";
  if (code.includes("invalid") || message.includes("invalid token") || message.includes("invalid otp")) return "验证码不正确，请检查后重试。";
  if (code.includes("rate_limit") || message.includes("rate limit") || message.includes("too many")) return operation === "resend" ? "发送过于频繁，请等待后重试。" : "尝试次数过多，请稍后再试。";
  return operation === "resend" ? "暂时无法重新发送验证码，请稍后再试。" : "暂时无法验证，请稍后再试。";
}
