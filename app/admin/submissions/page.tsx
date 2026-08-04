import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { requireAdmin } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { SubmissionAdminTable } from "@/components/admin/SubmissionAdminTable";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  await requireAdmin();
  const submissions = await prisma.venueSubmission.findMany({ include: { resultingVenue: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="detail-shell"><Link className="back-link" href="/admin/sources"><ArrowLeft size={16} />返回数据源管理</Link><section className="detail-panel wide"><ClipboardCheck size={28} /><div><p className="eyebrow">UGC administration</p><h1>用户地点投稿</h1><p>待确认投稿与最近自动发布内容。由于未启用内容审核，请及时后审并下架不当内容。</p><SubmissionAdminTable initialSubmissions={submissions} /></div></section></main>;
}
