"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
