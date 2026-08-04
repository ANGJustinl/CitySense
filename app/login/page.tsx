import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { getOptionalUser } from "@/server/auth/current-user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/submit-place";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  if (await getOptionalUser()) {
    redirect(nextPath as never);
  }

  return (
    <main className="detail-shell">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回工作台</Link>
      <section className="detail-panel">
        <LogIn size={28} />
        <div>
          <p className="eyebrow">CitySense Account</p>
          <h1>邮箱登录</h1>
          <p>登录后可以分享小众地点、上传照片，并查看投稿状态。</p>
          <MagicLinkForm nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
