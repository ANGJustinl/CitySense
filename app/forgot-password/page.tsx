import { AuthPage } from "@/components/auth/AuthPage";
import { safeAuthNext } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeAuthNext(params.next, "/");
  return <AuthPage intent="forgot-password" nextPath={nextPath} errorCode={params.error} />;
}
