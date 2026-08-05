"use client";

import { useState } from "react";
import { Loader2, Mail, RotateCcw } from "lucide-react";
import type { AuthIntent } from "@/lib/auth/redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type FormStatus = "idle" | "submitting" | "sent" | "error";

function getFriendlyError(cause: unknown, intent: AuthIntent) {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("not configured")) return "认证服务暂不可用，请稍后再试。";
  if (message.includes("rate") || message.includes("too many")) return "请求过于频繁，请稍后再发送。";
  if (intent === "login" && (message.includes("signups not allowed") || message.includes("user not found"))) {
    return "没有找到可登录账户，请先注册。";
  }
  return `${intent === "register" ? "注册" : "登录"}邮件发送失败，请稍后重试。`;
}

export function MagicLinkForm({
  intent,
  nextPath
}: {
  intent: AuthIntent;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string>();
  const isRegister = intent === "register";
  const loading = status === "submitting";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setError(undefined);

    try {
      const supabase = createSupabaseBrowserClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", nextPath);
      callback.searchParams.set("intent", intent);
      const result = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: callback.toString(),
          shouldCreateUser: isRegister
        }
      });
      if (result.error) throw result.error;
      setStatus("sent");
    } catch (cause) {
      setError(getFriendlyError(cause, intent));
      setStatus("error");
    }
  }

  return (
    <form aria-busy={loading} className="auth-form" onSubmit={submit}>
      <label className="auth-field" htmlFor="auth-email">
        <span>邮箱地址</span>
        <div className="auth-input-wrap">
          <Mail aria-hidden="true" size={18} />
          <input
            aria-describedby={error ? "auth-form-error" : undefined}
            autoCapitalize="none"
            autoComplete="email"
            id="auth-email"
            inputMode="email"
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== "submitting") setStatus("idle");
              setError(undefined);
            }}
            placeholder="you@example.com"
            required
            spellCheck={false}
            type="email"
            value={email}
          />
        </div>
      </label>

      <button className="auth-submit" disabled={loading} type="submit">
        {loading ? <Loader2 className="spin" size={18} /> : status === "sent" ? <RotateCcw size={18} /> : <Mail size={18} />}
        {loading
          ? "正在发送…"
          : status === "sent"
            ? "重新发送邮件"
            : `发送${isRegister ? "注册" : "登录"}链接`}
      </button>

      {status === "sent" ? (
        <div className="auth-success" role="status" aria-live="polite">
          <strong>{isRegister ? "注册链接" : "登录链接"}已发送</strong>
          <span>请前往 {email.trim()} 查收邮件；若没有看到，也请检查垃圾邮件文件夹。</span>
        </div>
      ) : null}
      {error ? <p className="auth-form-error" id="auth-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
