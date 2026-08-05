"use client";

import { useState } from "react";

function ModerationButtons({ kind, id, version }: { kind: "posts" | "comments" | "reports"; id: string; version?: number }) {
  const [done, setDone] = useState(false);
  async function decide(action: string) {
    const reasonText = action === "APPROVE" || action === "RESTORE" ? undefined : prompt("请输入处理原因") ?? undefined;
    const response = await fetch(`/api/admin/community/${kind}/${id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, expectedVersion: version, reasonText }) });
    if (response.ok) setDone(true);
  }
  if (done) return <span className="community-moderated">已处理</span>;
  return <div className="community-moderation-actions">{kind === "reports" ? <><button onClick={() => void decide("APPROVE")} type="button">已处置</button><button onClick={() => void decide("DISMISS_REPORT")} type="button">驳回举报</button></> : <><button onClick={() => void decide("APPROVE")} type="button">通过</button><button onClick={() => void decide("HIDE")} type="button">隐藏</button><button className="danger" onClick={() => void decide("REMOVE")} type="button">移除</button></>}</div>;
}

export function CommunityModerationTable({ queue }: { queue: any }) {
  return <div className="community-admin-sections"><section><h2>待审动态 <span>{queue.posts.length}</span></h2>{queue.posts.map((post: any) => <article key={post.id}><div><small>{post.author?.buddyProfile?.displayName ?? post.authorId} · 举报 {post.reportCount}</small><p>{post.body || "（仅附件动态）"}</p></div><ModerationButtons id={post.id} kind="posts" version={post.version} /></article>)}</section><section><h2>待审评论 <span>{queue.comments.length}</span></h2>{queue.comments.map((comment: any) => <article key={comment.id}><div><small>{comment.author?.buddyProfile?.displayName ?? comment.authorId} · 举报 {comment.reportCount}</small><p>{comment.body}</p></div><ModerationButtons id={comment.id} kind="comments" version={comment.version} /></article>)}</section><section><h2>开放举报 <span>{queue.reports.length}</span></h2>{queue.reports.map((report: any) => <article key={report.id}><div><small>{report.targetType} · {report.category}</small><p>{report.detail ?? "未填写补充说明"}</p></div><ModerationButtons id={report.id} kind="reports" /></article>)}</section></div>;
}
