"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const supabase = createSupabaseBrowserClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("intent", "recovery");
      callback.searchParams.set("next", nextPath);
      const result = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: callback.toString()
      });
      if (result.error) throw result.error;
      setSent(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : "";
      setError(message.includes("rate") ? "请求过于频繁，请稍后再试。" : "暂时无法发送重置邮件，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form aria-busy={loading} className="auth-form" onSubmit={submit}>
      <label className="auth-field" htmlFor="forgot-email"><span>邮箱地址</span><div className="auth-input-wrap"><Mail aria-hidden="true" size={18} /><input autoComplete="email" id="forgot-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div></label>
      <button className="auth-submit" disabled={loading} type="submit">{loading ? <Loader2 className="spin" size={18} /> : <Mail size={18} />}{loading ? "正在发送…" : "发送重置邮件"}</button>
      {sent ? <div className="auth-success" role="status" aria-live="polite"><strong>请检查邮箱</strong><span>如果该邮箱对应 CitySense 账户，我们已发送密码重置邮件。</span></div> : null}
      {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
