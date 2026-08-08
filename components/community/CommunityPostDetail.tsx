"use client";

import Link from "next/link";
import { Bookmark, Flag, Heart, MapPin, Route, Share2, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { CommunityFollowButton } from "@/components/community/CommunityFollowButton";
import { UserAvatar } from "@/components/UserAvatar";
import type { CommunityPostView } from "@/server/community/types";

const REPORT_CATEGORIES = [
  ["INAPPROPRIATE_CONTENT", "不当内容"],
  ["HARASSMENT", "骚扰或攻击"],
  ["FRAUD", "欺诈信息"],
  ["UNSAFE_BEHAVIOR", "不安全行为"],
  ["IMPERSONATION", "冒充他人"],
  ["OTHER", "其他问题"]
] as const;

export function CommunityPostDetail({ post, viewerId }: { post: CommunityPostView; viewerId?: string }) {
  const [liked, setLiked] = useState(Boolean(post.viewer?.liked));
  const [bookmarked, setBookmarked] = useState(Boolean(post.viewer?.bookmarked));
  const [likeCount, setLikeCount] = useState(post.counts.likes);
  const [busy, setBusy] = useState<"like" | "bookmark" | "report">();
  const [message, setMessage] = useState<string>();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<(typeof REPORT_CATEGORIES)[number][0]>("INAPPROPRIATE_CONTENT");
  const [reportDetail, setReportDetail] = useState("");
  const [blockUser, setBlockUser] = useState(false);

  function requireViewer() {
    if (viewerId) return true;
    location.href = `/login?next=${encodeURIComponent(`/community/posts/${post.id}`)}`;
    return false;
  }

  async function interact(kind: "like" | "bookmark", enabled: boolean) {
    if (!requireViewer() || busy) return;
    const previousLiked = liked;
    const previousBookmarked = bookmarked;
    const previousCount = likeCount;
    setBusy(kind);
    setMessage(undefined);
    if (kind === "like") { setLiked(enabled); setLikeCount((count) => Math.max(0, count + (enabled ? 1 : -1))); }
    else setBookmarked(enabled);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/${kind}`, { method: enabled ? "PUT" : "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "操作失败，请重试");
      if (kind === "like" && typeof result.count === "number") setLikeCount(result.count);
    } catch (cause) {
      setLiked(previousLiked);
      setBookmarked(previousBookmarked);
      setLikeCount(previousCount);
      setMessage(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(undefined);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${post.author?.displayName ?? "城市居民"}的城市手记`, text: post.body.slice(0, 90), url });
      else { await navigator.clipboard.writeText(url); setMessage("链接已复制"); }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setMessage("暂时无法分享，请稍后重试");
    }
  }

  async function report(event: React.FormEvent) {
    event.preventDefault();
    if (!requireViewer() || busy) return;
    setBusy("report");
    setMessage(undefined);
    try {
      const response = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ targetType: "POST", postId: post.id, category: reportCategory, detail: reportDetail || undefined, blockUser })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "举报提交失败");
      setReportOpen(false);
      setMessage("已收到举报，我们会尽快处理");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "举报提交失败");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="community-detail-layout">
      <article className="community-post-detail">
        <header className="community-detail-author">
          <UserAvatar avatarUrl={post.author?.avatarUrl} className="community-avatar large" identity={post.author?.userId ?? post.id} name={post.author?.displayName ?? "城市居民"} />
          <div><Link href={post.author ? `/community/profile/${post.author.userId}` : "#"}>{post.author?.displayName ?? "城市居民"}</Link><small>{post.city}{post.area ? ` · ${post.area}` : ""} · {post.publishedAt ? new Date(post.publishedAt).toLocaleString("zh-CN") : ""}</small></div>
          {post.author ? <CommunityFollowButton initialFollowing={Boolean(post.viewer?.followsAuthor)} returnTo={`/community/posts/${post.id}`} userId={post.author.userId} viewerId={viewerId} /> : null}
        </header>
        <p className="community-detail-body">{post.body}</p>
        {post.images.length ? <div className="community-detail-images">{post.images.map((image) => <img alt={image.altText ?? "城市手记图片"} key={image.id} src={image.url} />)}</div> : null}
      </article>

      <aside className="community-detail-desk">
        <header><p className="eyebrow">EDITOR&apos;S NOTES</p><h2>这则手记的注脚</h2></header>
        <div className="community-detail-actions">
          <button aria-pressed={liked} className={liked ? "active" : ""} disabled={Boolean(busy)} onClick={() => void interact("like", !liked)} type="button"><Heart fill={liked ? "currentColor" : "none"} size={18} /><span><strong>{likeCount}</strong>喜欢</span></button>
          <button aria-pressed={bookmarked} className={bookmarked ? "active" : ""} disabled={Boolean(busy)} onClick={() => void interact("bookmark", !bookmarked)} type="button"><Bookmark fill={bookmarked ? "currentColor" : "none"} size={18} /><span><strong>{bookmarked ? "已收藏" : "收藏"}</strong>私人可见</span></button>
          <button onClick={() => void share()} type="button"><Share2 size={18} /><span><strong>分享</strong>发送给同路人</span></button>
        </div>
        {post.attachments.length ? <div className="community-attachments detail">{post.attachments.map((attachment) => <div key={attachment.id}>{attachment.type === "PLACE" ? <MapPin size={18} /> : <Route size={18} />}<span><small>{attachment.type === "PLACE" ? "关联地点" : "关联路线"}</small><strong>{attachment.title}</strong><em>{attachment.subtitle}</em></span></div>)}</div> : <p className="community-detail-no-attachment">这则手记没有关联地点或路线。</p>}
        {post.author?.userId !== viewerId ? <button className="community-report-trigger" onClick={() => { if (requireViewer()) setReportOpen(true); }} type="button"><Flag size={15} />举报这则内容</button> : null}
        <div className="community-detail-safety"><ShieldCheck size={16} /><span><strong>真实、友善、有边界</strong><small>请勿在公开内容中交换敏感信息</small></span></div>
        {message ? <p className="community-detail-message" role="status">{message}</p> : null}
      </aside>

      {reportOpen ? <div className="community-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}><form aria-label="举报这则手记" className="community-report-dialog" onSubmit={report}><header><div><p className="eyebrow">REPORT</p><h2>告诉我们发生了什么</h2></div><button aria-label="关闭举报" onClick={() => setReportOpen(false)} type="button"><X size={18} /></button></header><label><span>问题类型</span><select onChange={(event) => setReportCategory(event.target.value as typeof reportCategory)} value={reportCategory}>{REPORT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>补充说明</span><textarea maxLength={1000} onChange={(event) => setReportDetail(event.target.value)} placeholder="选填，请不要填写敏感个人信息" value={reportDetail} /></label><label className="community-report-block"><input checked={blockUser} onChange={(event) => setBlockUser(event.target.checked)} type="checkbox" /><span>同时屏蔽该用户，之后不再互相展示内容</span></label><button className="community-report-submit" disabled={busy === "report"} type="submit">{busy === "report" ? "正在提交…" : "提交举报"}</button></form></div> : null}
    </div>
  );
}
