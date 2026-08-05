import { NextResponse } from "next/server";
import {
  buildAuthPath,
  parseAuthIntent,
  safeAuthNext
} from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeAuthNext(url.searchParams.get("next"));
  const intent = parseAuthIntent(url.searchParams.get("intent"));
  const supabase = await createSupabaseServerClient();

  if (!code || !supabase) {
    const target = intent === "recovery"
      ? `/forgot-password?next=${encodeURIComponent(nextPath)}&error=invalid_callback`
      : buildAuthPath(intent, nextPath, "invalid_callback");
    return NextResponse.redirect(new URL(target, url.origin));
  }

  const result = await supabase.auth.exchangeCodeForSession(code);
  if (result.error) {
    const target = intent === "recovery"
      ? `/forgot-password?next=${encodeURIComponent(nextPath)}&error=auth_callback_failed`
      : buildAuthPath(intent, nextPath, "auth_callback_failed");
    return NextResponse.redirect(new URL(target, url.origin));
  }

  if (intent === "recovery") {
    return NextResponse.redirect(
      new URL(`/update-password?next=${encodeURIComponent(nextPath)}`, url.origin)
    );
  }
  return NextResponse.redirect(new URL(nextPath, url.origin));
}
