import Link from "next/link";
import { ArrowLeft, Cable } from "lucide-react";
import { SourceIngestConsole } from "@/components/city/SourceIngestConsole";
import { getIngestStatus } from "@/server/ingest/status";
import { requireAdmin } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function SourcesAdminPage() {
  await requireAdmin();
  const initialStatus = await getIngestStatus();

  return (
    <main className="detail-shell">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        返回工作台
      </Link>
      <section className="detail-panel wide">
        <Cable size={26} />
        <div>
          <p className="eyebrow">Source adapters</p>
          <h1>城市信号接入层</h1>
          <p><Link className="text-link" href="/admin/submissions">查看用户地点投稿审核队列</Link></p>
          <SourceIngestConsole initialStatus={initialStatus} />
        </div>
      </section>
    </main>
  );
}
