import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/submit-place";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  const result = await supabase.auth.exchangeCodeForSession(code);
  if (result.error) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
