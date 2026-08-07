import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getOwnSubmission } from "@/server/submissions/service";
import { SUBMISSION_STATUS_META } from "@/server/submissions/presentation";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getOwnSubmission(user.appUser.id, id);
  if (!item) notFound();
  const status = SUBMISSION_STATUS_META[item.status];

  return (
    <>
      <ProductPageHeader active="submissions" />
      <main className="detail-shell submission-product-page">
        <Link className="back-link" href="/my-submissions"><ArrowLeft size={16} />返回投稿列表</Link>
        <section className="detail-panel wide submission-detail-card">
          <header className="submission-detail-heading">
            <span className="submit-place-mark"><MapPin size={22} /></span>
            <div><p className="product-kicker">SUBMISSION · {item.id.slice(0, 8)}</p><h1>{item.name}</h1><p>{item.publicStatusMessage ?? status.description}</p></div>
            <span className={`submission-status tone-${status.tone}`}>{status.label}</span>
          </header>
          <div className="profile-stats-grid">
            <div className="profile-stat"><span>当前状态</span><strong>{status.label}</strong></div>
            <div className="profile-stat"><span>匹配方式</span><strong>{item.matchType ?? "处理中"}</strong></div>
            <div className="profile-stat"><span>现场图片</span><strong>{item.images.length} 张</strong></div>
          </div>
          <section className="profile-section"><p className="product-kicker">PLACE NOTE</p><h2>地点信息</h2><p>{item.description}</p><p>{item.city} · {item.area ?? "全城"} · {item.address}</p><div className="tag-chips approved">{item.tags.map((tag) => <span className="chip approved" key={tag}>{tag}</span>)}</div></section>
          {item.resultingVenue ? <p className="submission-result"><strong>已发布地点</strong><span>{item.resultingVenue.name}</span></p> : null}
          <section className="profile-section"><p className="product-kicker">TIMELINE</p><h2>处理记录</h2>{item.moderationActions.length ? <ul className="trace-list">{item.moderationActions.map((action) => <li className="trace-entry tone-info" key={action.id}><div className="trace-entry-content"><p>{action.action}</p><p>{action.reasonText ?? action.toStatus}</p></div><time>{action.createdAt.toLocaleString("zh-CN")}</time></li>)}</ul> : <p className="product-empty">投稿正在排队，状态更新后会显示在这里。</p>}</section>
        </section>
      </main>
    </>
  );
}
