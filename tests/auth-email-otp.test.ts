import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_PENDING_TTL_MS,
  emailOtpError,
  parsePendingSignup,
  remainingCooldownSeconds,
  sanitizeEmailOtp,
  validateEmailOtp
} from "@/lib/auth/email-otp";

test("email OTP keeps only six digits", () => {
  assert.equal(sanitizeEmailOtp("1a2 3-45678"), "123456");
  assert.equal(validateEmailOtp("123456"), undefined);
  assert.equal(validateEmailOtp("12345"), "请输入 6 位邮箱验证码。");
});

test("OTP cooldown uses an absolute deadline", () => {
  assert.equal(remainingCooldownSeconds(EMAIL_OTP_COOLDOWN_MS, 0), 60);
  assert.equal(remainingCooldownSeconds(59_100, 0), 60);
  assert.equal(remainingCooldownSeconds(1_000, 2_000), 0);
});

test("pending signup parsing rejects expired and sensitive-shaped data", () => {
  const now = 1_000_000;
  assert.deepEqual(parsePendingSignup(JSON.stringify({ email: "test@example.com", createdAt: now, resendAvailableAt: now + 60_000 }), now), {
    email: "test@example.com",
    createdAt: now,
    resendAvailableAt: now + 60_000
  });
  assert.equal(parsePendingSignup(JSON.stringify({ email: "test@example.com", createdAt: now - EMAIL_OTP_PENDING_TTL_MS - 1, resendAvailableAt: now }), now), undefined);
  assert.equal(parsePendingSignup("not-json", now), undefined);
});

test("OTP errors map to stable messages", () => {
  assert.equal(emailOtpError({ code: "otp_expired" }, "verify"), "验证码已过期，请重新发送。");
  assert.equal(emailOtpError({ code: "invalid_otp" }, "verify"), "验证码不正确，请检查后重试。");
  assert.equal(emailOtpError({ code: "over_email_send_rate_limit" }, "resend"), "发送过于频繁，请等待后重试。");
});
