"use client";

import Link from "next/link";
import { Bookmark, Heart, MapPin, MessageCircle, Route } from "lucide-react";
import { useState } from "react";
import type { CommunityPostView } from "@/server/community/types";
import { CommunityFollowButton } from "@/components/community/CommunityFollowButton";
import { UserAvatar } from "@/components/UserAvatar";

export function CommunityPostCard({ post, viewerId, index = 0 }: { post: CommunityPostView; viewerId?: string; index?: number }) {
  const [liked, setLiked] = useState(Boolean(post.viewer?.liked));
  const [bookmarked, setBookmarked] = useState(Boolean(post.viewer?.bookmarked));
  const [likeCount, setLikeCount] = useState(post.counts.likes);
  const [busy, setBusy] = useState<"like" | "bookmark">();
  const [error, setError] = useState<string>();
  async function act(kind: "like" | "bookmark", enabled: boolean) {
    if (!viewerId) { location.href = `/login?next=${encodeURIComponent(`/community/posts/${post.id}`)}`; return; }
    if (busy) return;
    const previousLiked = liked;
    const previousBookmarked = bookmarked;
    const previousLikeCount = likeCount;
    setBusy(kind);
    setError(undefined);
    if (kind === "like") { setLiked(enabled); setLikeCount((value) => Math.max(0, value + (enabled ? 1 : -1))); }
    else setBookmarked(enabled);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/${kind}`, { method: enabled ? "PUT" : "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "操作失败，请重试");
      if (kind === "like" && typeof result.count === "number") setLikeCount(result.count);
    } catch (cause) {
      setLiked(previousLiked);
      setBookmarked(previousBookmarked);
      setLikeCount(previousLikeCount);
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(undefined);
    }
  }
  return <article className={`community-post-card ${post.images.length ? "with-image" : "text-led"} ${index === 0 ? "featured" : ""}`} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
    <div className="community-post-author"><Link href={post.author ? `/community/profile/${post.author.userId}` : "#"}><UserAvatar avatarUrl={post.author?.avatarUrl} className="community-avatar" identity={post.author?.userId ?? "city-resident"} name={post.author?.displayName ?? "城市居民"} /></Link><div><Link href={post.author ? `/community/profile/${post.author.userId}` : "#"}>{post.author?.displayName ?? "城市居民"}</Link><small>{post.area ? `${post.city} · ${post.area}` : post.city} · {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "草稿"}</small></div>{post.author ? <CommunityFollowButton initialFollowing={Boolean(post.viewer?.followsAuthor)} returnTo={`/community/posts/${post.id}`} userId={post.author.userId} viewerId={viewerId} /> : null}<span className="community-entry-number">№ {String(index + 1).padStart(2, "0")}</span></div>
    {post.images.length ? <Link className={`community-photo-grid count-${Math.min(post.images.length, 4)}`} href={`/community/posts/${post.id}`}>{post.images.slice(0, 4).map((image, imageIndex) => <figure key={image.id}><img alt={image.altText ?? "社区图片"} src={image.url} />{imageIndex === 3 && post.images.length > 4 ? <span>+{post.images.length - 4}</span> : null}</figure>)}</Link> : null}
    <Link className="community-post-copy" href={`/community/posts/${post.id}`}><p>{post.body || "分享了一则城市发现"}</p></Link>
    {post.attachments.length ? <div className="community-attachments">{post.attachments.map((attachment) => <div key={attachment.id}>{attachment.type === "PLACE" ? <MapPin size={15} /> : <Route size={15} />}<span><strong>{attachment.title}</strong><small>{attachment.subtitle}</small></span></div>)}</div> : null}
    <div className="community-action-row"><button aria-label={liked ? "取消喜欢" : "喜欢"} className={liked ? "active" : ""} disabled={Boolean(busy)} onClick={() => void act("like", !liked)} type="button"><Heart fill={liked ? "currentColor" : "none"} size={18} />{likeCount}</button><Link href={`/community/posts/${post.id}`}><MessageCircle size={18} />{post.counts.comments}</Link><button aria-label={bookmarked ? "取消收藏" : "收藏"} className={bookmarked ? "active" : ""} disabled={Boolean(busy)} onClick={() => void act("bookmark", !bookmarked)} type="button"><Bookmark fill={bookmarked ? "currentColor" : "none"} size={18} />{bookmarked ? "已收藏" : "收藏"}</button></div>
    {error ? <p className="community-card-error" role="alert">{error}</p> : null}
  </article>;
}
