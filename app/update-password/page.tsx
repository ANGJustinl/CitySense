import type { Route } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/AuthPage";
import { safeAuthNext } from "@/lib/auth/redirect";
import { getOptionalAuthUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeAuthNext(params.next, "/");
  if (!(await getOptionalAuthUser())) {
    redirect(`/forgot-password?next=${encodeURIComponent(nextPath)}&error=invalid_recovery_session` as Route);
  }
  return <AuthPage intent="update-password" nextPath={nextPath} errorCode={params.error} />;
}
