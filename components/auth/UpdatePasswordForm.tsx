"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { validatePassword, validatePasswordConfirmation } from "@/lib/auth/password";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function UpdatePasswordForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validatePassword(password) ?? validatePasswordConfirmation(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      router.replace(nextPath as Route);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : "";
      setError(message.includes("session") ? "重置链接已失效，请重新发送密码重置邮件。" : "密码更新失败，请稍后重试。");
      setLoading(false);
    }
  }

  return (
    <form aria-busy={loading} className="auth-form" onSubmit={submit}>
      <label className="auth-field" htmlFor="new-password"><span>新密码</span><div className="auth-input-wrap"><LockKeyhole aria-hidden="true" size={18} /><input autoComplete="new-password" id="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} /><button aria-label={showPassword ? "隐藏密码" : "显示密码"} className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label className="auth-field" htmlFor="confirm-password"><span>确认新密码</span><div className="auth-input-wrap"><LockKeyhole aria-hidden="true" size={18} /><input autoComplete="new-password" id="confirm-password" minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type={showPassword ? "text" : "password"} value={confirmation} /></div></label>
      <p className="auth-password-hint">密码至少需要 8 个字符。</p>
      <button className="auth-submit" disabled={loading} type="submit">{loading ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}{loading ? "正在更新…" : "更新密码"}</button>
      {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
    </form>
  );
}
