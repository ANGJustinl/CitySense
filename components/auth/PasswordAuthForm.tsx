"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import {
  EMAIL_OTP_COOLDOWN_MS,
  PENDING_SIGNUP_STORAGE_KEY,
  emailOtpError,
  parsePendingSignup,
  remainingCooldownSeconds,
  sanitizeEmailOtp,
  validateEmailOtp
} from "@/lib/auth/email-otp";
import type { AuthIntent } from "@/lib/auth/redirect";
import { validatePassword, validatePasswordConfirmation } from "@/lib/auth/password";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type FormStatus = "idle" | "submitting" | "error";
type RegisterStep = "credentials" | "verification";
type PendingAction = "signup" | "login" | "verify" | "resend" | null;

function friendlyError(cause: unknown, intent: AuthIntent) {
  const error = cause as { code?: string; message?: string };
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) return "请先完成邮箱验证后再登录。";
  if (code.includes("rate_limit") || message.includes("rate limit") || message.includes("too many")) return "请求过于频繁，请稍后再试。";
  if (message.includes("not configured")) return "认证服务暂不可用，请稍后再试。";
  if (intent === "register" && (code === "user_already_exists" || message.includes("already registered"))) return "该邮箱已经注册，请直接登录；忘记密码时可通过邮箱重置。";
  return intent === "register" ? "注册失败，请检查信息后重试。" : "登录失败，请稍后再试。";
}

export function PasswordAuthForm({ intent, nextPath }: { intent: Extract<AuthIntent, "login" | "register">; nextPath: string }) {
  const router = useRouter();
  const isRegister = intent === "register";
  const [step, setStep] = useState<RegisterStep>("credentials");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const loading = status === "submitting";

  useEffect(() => {
    if (!isRegister) return;
    const timeout = window.setTimeout(() => {
      try {
        const restored = parsePendingSignup(window.sessionStorage.getItem(PENDING_SIGNUP_STORAGE_KEY));
        if (restored) {
          setPendingEmail(restored.email);
          setEmail(restored.email);
          setResendAvailableAt(restored.resendAvailableAt);
          setStep("verification");
          setNotice("请输入邮箱中最新的 6 位验证码。");
        }
      } catch { /* sessionStorage 不可用时静默降级。 */ }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isRegister]);

  useEffect(() => {
    if (step !== "verification" || !resendAvailableAt) return;
    const update = () => setRemaining(remainingCooldownSeconds(resendAvailableAt));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt, step]);

  function persistPendingSignup(targetEmail: string, availableAt: number) {
    try {
      window.sessionStorage.setItem(PENDING_SIGNUP_STORAGE_KEY, JSON.stringify({ email: targetEmail, createdAt: Date.now(), resendAvailableAt: availableAt }));
    } catch { /* 不阻塞注册流程。 */ }
  }

  function clearPendingSignup() {
    try { window.sessionStorage.removeItem(PENDING_SIGNUP_STORAGE_KEY); } catch { /* noop */ }
  }

  function enterVerification(targetEmail: string, message = "验证码已发送，请检查邮箱。") {
    const availableAt = Date.now() + EMAIL_OTP_COOLDOWN_MS;
    setPendingEmail(targetEmail);
    setEmail(targetEmail);
    setPassword("");
    setConfirmation("");
    setOtp("");
    setResendAvailableAt(availableAt);
    setStep("verification");
    setNotice(message);
    setError(undefined);
    setStatus("idle");
    setPendingAction(null);
    persistPendingSignup(targetEmail, availableAt);
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    const validationError = validatePassword(password) ?? (isRegister ? validatePasswordConfirmation(password, confirmation) : undefined);
    if (validationError) { setError(validationError); setStatus("error"); return; }
    setStatus("submitting");
    setPendingAction(isRegister ? "signup" : "login");
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const supabase = createSupabaseBrowserClient();
      const result = isRegister
        ? await supabase.auth.signUp({ email: normalizedEmail, password })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (result.error) throw result.error;
      if (!isRegister || result.data.session) { clearPendingSignup(); router.replace(nextPath as Route); router.refresh(); return; }
      enterVerification(normalizedEmail);
    } catch (cause) {
      const authError = cause as { code?: string; message?: string };
      const alreadyExists = isRegister && (authError.code === "user_already_exists" || authError.message?.toLowerCase().includes("already registered"));
      if (alreadyExists) {
        try {
          const resend = await createSupabaseBrowserClient().auth.resend({ type: "signup", email: normalizedEmail });
          if (resend.error) throw resend.error;
          enterVerification(normalizedEmail, "如果该账户仍待验证，我们已发送新的 6 位验证码。");
          return;
        } catch {
          setError("该邮箱已经注册，请直接登录；忘记密码时可通过邮箱重置。");
        }
      } else setError(friendlyError(cause, intent));
      setStatus("error");
      setPendingAction(null);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateEmailOtp(otp);
    if (validationError) { setError(validationError); return; }
    setStatus("submitting"); setPendingAction("verify"); setError(undefined);
    try {
      const result = await createSupabaseBrowserClient().auth.verifyOtp({ email: pendingEmail, token: otp, type: "email" });
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error("verification returned no session");
      clearPendingSignup();
      router.replace(nextPath as Route);
      router.refresh();
    } catch (cause) {
      setError(emailOtpError(cause, "verify")); setStatus("error"); setPendingAction(null);
    }
  }

  async function resendCode() {
    if (remaining > 0) return;
    setStatus("submitting"); setPendingAction("resend"); setError(undefined);
    try {
      const result = await createSupabaseBrowserClient().auth.resend({ type: "signup", email: pendingEmail });
      if (result.error) throw result.error;
      enterVerification(pendingEmail, "新的验证码已发送，请使用最新邮件中的 6 位数字。");
    } catch (cause) {
      setError(emailOtpError(cause, "resend")); setStatus("error"); setPendingAction(null);
    }
  }

  function editEmail() {
    clearPendingSignup(); setStep("credentials"); setOtp(""); setError(undefined); setNotice(undefined); setResendAvailableAt(0); setRemaining(0); setStatus("idle"); setPendingAction(null);
  }

  if (isRegister && step === "verification") {
    return (
      <form aria-busy={loading} className="auth-form auth-otp-form" onSubmit={verifyCode}>
        <div className="auth-otp-email"><Mail size={17} /><span><small>验证码已发送至</small><strong>{pendingEmail}</strong></span><button onClick={editEmail} type="button">修改邮箱</button></div>
        <label className="auth-field" htmlFor="auth-email-otp"><span>6 位邮箱验证码</span><div className="auth-input-wrap auth-otp-input-wrap"><KeyRound size={18} /><input aria-describedby="auth-otp-help" autoComplete="one-time-code" id="auth-email-otp" inputMode="numeric" maxLength={6} onChange={(event) => setOtp(sanitizeEmailOtp(event.target.value))} pattern="[0-9]{6}" placeholder="000000" required type="text" value={otp} /></div></label>
        <p className="auth-password-hint" id="auth-otp-help">请输入邮件中最新的 6 位数字验证码，验证码将在一段时间后失效。</p>
        <button className="auth-submit" disabled={loading} type="submit">{pendingAction === "verify" ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}{pendingAction === "verify" ? "正在验证…" : "验证并完成注册"}</button>
        <button className="auth-secondary-button" disabled={loading || remaining > 0} onClick={resendCode} type="button"><RotateCcw size={15} />{remaining > 0 ? `${remaining} 秒后可重新发送` : "重新发送验证码"}</button>
        {notice ? <div className="auth-success" role="status" aria-live="polite"><strong>检查你的邮箱</strong><span>{notice}</span></div> : null}
        {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form aria-busy={loading} className="auth-form" onSubmit={submitCredentials}>
      <label className="auth-field" htmlFor="auth-email"><span>邮箱地址</span><div className="auth-input-wrap"><Mail size={18} /><input autoCapitalize="none" autoComplete="email" id="auth-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required spellCheck={false} type="email" value={email} /></div></label>
      <label className="auth-field" htmlFor="auth-password"><span>{isRegister ? "设置密码" : "密码"}</span><div className="auth-input-wrap"><LockKeyhole size={18} /><input autoComplete={isRegister ? "new-password" : "current-password"} id="auth-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} /><button aria-label={showPassword ? "隐藏密码" : "显示密码"} className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      {isRegister ? <label className="auth-field" htmlFor="auth-password-confirm"><span>确认密码</span><div className="auth-input-wrap"><LockKeyhole size={18} /><input autoComplete="new-password" id="auth-password-confirm" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type={showPassword ? "text" : "password"} value={confirmation} /></div></label> : <Link className="auth-forgot-link" href={`/forgot-password?next=${encodeURIComponent(nextPath)}` as Route}>忘记密码？</Link>}
      {isRegister ? <p className="auth-password-hint">密码至少需要 8 个字符；提交后我们会向邮箱发送 6 位验证码。</p> : null}
      <button className="auth-submit" disabled={loading} type="submit">{loading && pendingAction !== "resend" ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}{loading ? "正在处理…" : isRegister ? "获取邮箱验证码" : "登录账户"}</button>
      {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
