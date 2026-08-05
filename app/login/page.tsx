import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/AuthPage";
import { safeAuthNext } from "@/lib/auth/redirect";
import { getOptionalAuthUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "登录 · CitySense",
  description: "登录 CitySense，分享城市地点并查看投稿状态。"
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeAuthNext(params.next);
  if (await getOptionalAuthUser()) redirect(nextPath as never);

  return <AuthPage errorCode={params.error} intent="login" nextPath={nextPath} />;
}
