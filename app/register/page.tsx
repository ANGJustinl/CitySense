import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/AuthPage";
import { safeAuthNext } from "@/lib/auth/redirect";
import { getOptionalAuthUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "注册 · CitySense",
  description: "创建 CitySense 账户，开始记录你的城市发现。"
};

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeAuthNext(params.next);
  if (await getOptionalAuthUser()) redirect(nextPath as never);

  return <AuthPage errorCode={params.error} intent="register" nextPath={nextPath} />;
}
