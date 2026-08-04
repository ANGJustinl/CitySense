import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getOwnSubmission } from "@/server/submissions/service";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getOwnSubmission(user.appUser.id, id);
  if (!item) notFound();
  return <main className="detail-shell"><Link className="back-link" href="/my-submissions"><ArrowLeft size={16} />返回投稿列表</Link><section className="detail-panel wide"><MapPin size={28} /><div><p className="eyebrow">Submission {item.id}</p><h1>{item.name}</h1><p>{item.publicStatusMessage ?? item.status}</p><div className="profile-stats-grid"><div className="profile-stat"><span>状态</span><strong>{item.status}</strong></div><div className="profile-stat"><span>匹配</span><strong>{item.matchType ?? "处理中"}</strong></div><div className="profile-stat"><span>图片</span><strong>{item.images.length}</strong></div></div><section className="profile-section"><h2>地点信息</h2><p>{item.description}</p><p>{item.city} · {item.area ?? "全城"} · {item.address}</p><div className="tag-chips approved">{item.tags.map((tag) => <span className="chip approved" key={tag}>{tag}</span>)}</div></section>{item.resultingVenue ? <p><strong>已发布地点：</strong>{item.resultingVenue.name}</p> : null}<section className="profile-section"><h2>处理记录</h2><ul className="trace-list">{item.moderationActions.map((action) => <li className="trace-entry tone-info" key={action.id}><div className="trace-entry-content"><p>{action.action}</p><p>{action.reasonText ?? action.toStatus}</p></div><time>{action.createdAt.toLocaleString("zh-CN")}</time></li>)}</ul></section></div></section></main>;
}
