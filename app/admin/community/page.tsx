import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CommunityModerationTable } from "@/components/admin/CommunityModerationTable";
import { requireAdmin } from "@/server/auth/current-user";
import { listCommunityModerationQueue } from "@/server/community/moderation";

export const dynamic = "force-dynamic";
export default async function AdminCommunityPage() {
  await requireAdmin(); const queue = await listCommunityModerationQueue();
  return <main className="community-page-shell community-admin-page"><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span><ShieldCheck size={15} />社区治理</span></nav><header className="community-section-intro"><p className="eyebrow">MODERATION DESK</p><h1>让真实分享保持友善</h1><p>处理后审内容、用户举报与风险动态；每一次操作都会留下审计记录。</p></header><CommunityModerationTable queue={queue} /></main>;
}
