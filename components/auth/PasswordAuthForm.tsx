"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import type { AuthIntent } from "@/lib/auth/redirect";
import { validatePassword, validatePasswordConfirmation } from "@/lib/auth/password";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type FormStatus = "idle" | "submitting" | "sent" | "error";

function friendlyError(cause: unknown, intent: AuthIntent) {
  const error = cause as { code?: string; message?: string };
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "邮箱或密码不正确。";
  }
  if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
    return "请先完成邮箱验证后再登录。";
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit") || message.includes("too many")) {
    return "请求过于频繁，请稍后再试。";
  }
  if (message.includes("not configured")) return "认证服务暂不可用，请稍后再试。";
  if (intent === "register" && (code === "user_already_exists" || message.includes("already registered"))) {
    return "注册请求未完成，请检查邮箱后重试。";
  }
  if (intent === "register") return "注册失败，请检查信息后重试。";
  return "登录失败，请稍后再试。";
}

export function PasswordAuthForm({
  intent,
  nextPath
}: {
  intent: Extract<AuthIntent, "login" | "register">;
  nextPath: string;
}) {
  const router = useRouter();
  const isRegister = intent === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const loading = status === "submitting";

  function validate() {
    const passwordError = validatePassword(password);
    if (passwordError) return passwordError;
    if (isRegister) return validatePasswordConfirmation(password, confirmation);
    return undefined;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setStatus("error");
      return;
    }
    setStatus("submitting");

    try {
      const supabase = createSupabaseBrowserClient();
      const normalizedEmail = email.trim().toLowerCase();
      const result = isRegister
        ? await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?intent=register&next=${encodeURIComponent(nextPath)}`
            }
          })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (result.error) throw result.error;

      if (!isRegister || result.data.session) {
        router.replace(nextPath as Route);
        router.refresh();
        return;
      }

      setNotice("如果该邮箱可以用于注册，我们已发送验证邮件，请前往邮箱完成验证。登录前请先点击邮件中的验证链接。");
      setStatus("sent");
    } catch (cause) {
      setError(friendlyError(cause, intent));
      setStatus("error");
    }
  }

  return (
    <form aria-busy={loading} className="auth-form" onSubmit={submit}>
      <label className="auth-field" htmlFor="auth-email">
        <span>邮箱地址</span>
        <div className="auth-input-wrap"><Mail aria-hidden="true" size={18} /><input autoCapitalize="none" autoComplete="email" id="auth-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required spellCheck={false} type="email" value={email} /></div>
      </label>
      <label className="auth-field" htmlFor="auth-password">
        <span>{isRegister ? "设置密码" : "密码"}</span>
        <div className="auth-input-wrap"><LockKeyhole aria-hidden="true" size={18} /><input autoComplete={isRegister ? "new-password" : "current-password"} id="auth-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} /><button aria-label={showPassword ? "隐藏密码" : "显示密码"} className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      </label>
      {isRegister ? <label className="auth-field" htmlFor="auth-password-confirm"><span>确认密码</span><div className="auth-input-wrap"><LockKeyhole aria-hidden="true" size={18} /><input autoComplete="new-password" id="auth-password-confirm" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type={showPassword ? "text" : "password"} value={confirmation} /></div></label> : <Link className="auth-forgot-link" href={`/forgot-password?next=${encodeURIComponent(nextPath)}` as Route}>忘记密码？</Link>}
      {isRegister ? <p className="auth-password-hint">密码至少需要 8 个字符，请使用你能记住的安全密码。</p> : null}
      <button className="auth-submit" disabled={loading} type="submit">{loading ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}{loading ? "正在处理…" : isRegister ? "创建账户" : "登录账户"}</button>
      {notice ? <div className="auth-success" role="status" aria-live="polite"><strong>验证邮件已发送</strong><span>{notice}</span></div> : null}
      {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
