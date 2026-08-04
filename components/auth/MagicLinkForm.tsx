"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function MagicLinkForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const supabase = createSupabaseBrowserClient();
      const siteUrl = window.location.origin;
      const callback = new URL("/auth/callback", siteUrl);
      callback.searchParams.set("next", nextPath);
      const result = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback.toString() }
      });
      if (result.error) throw result.error;
      setMessage("如果邮箱有效，你会收到一封登录邮件。请点击邮件中的链接继续。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发送登录邮件失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="submission-form" onSubmit={submit}>
      <label className="field">
        <span>邮箱</span>
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? <Loader2 className="spin" size={17} /> : <Mail size={17} />}
        发送登录链接
      </button>
      {message ? <p className="profile-status-note">{message}</p> : null}
      {error ? <p className="profile-error" role="alert">{error}</p> : null}
    </form>
  );
}
