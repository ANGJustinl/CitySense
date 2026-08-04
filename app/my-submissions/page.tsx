import Link from "next/link";
import { ArrowLeft, MapPinned, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listOwnSubmissions } from "@/server/submissions/service";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  DRAFT: "草稿", SUBMITTED: "已提交", PROCESSING: "处理中", AUTO_PUBLISHED: "已自动发布",
  NEEDS_REVIEW: "待管理员确认", CHANGES_REQUESTED: "需要补充", APPROVED: "已通过", REJECTED: "已拒绝", WITHDRAWN: "已撤回", REMOVED: "已删除"
};

export default async function MySubmissionsPage() {
  const user = await requireUser();
  const submissions = await listOwnSubmissions(user.appUser.id);
  return (
    <main className="detail-shell">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回工作台</Link>
      <section className="detail-panel wide"><MapPinned size={28} /><div className="submission-list-wrap"><div className="submission-list-heading"><div><p className="eyebrow">My contributions</p><h1>我的地点投稿</h1></div><Link className="primary-button" href="/submit-place"><Plus size={16} />分享地点</Link></div>
        {submissions.length === 0 ? <p className="pulse-empty">还没有投稿。</p> : <div className="submission-list">{submissions.map((item) => <Link href={`/my-submissions/${item.id}`} key={item.id}><span className={`submission-status status-${item.status.toLowerCase()}`}>{labels[item.status] ?? item.status}</span><strong>{item.name}</strong><span>{item.area ?? item.city} · {item.address}</span><time>{item.createdAt.toLocaleString("zh-CN")}</time></Link>)}</div>}
      </div></section>
    </main>
  );
}
