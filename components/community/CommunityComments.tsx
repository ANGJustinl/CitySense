"use client";

import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import type { CommunityCommentView } from "@/server/community/types";
import { UserAvatar } from "@/components/UserAvatar";

export function CommunityComments({ postId, initialComments, viewerId }: { postId: string; initialComments: CommunityCommentView[]; viewerId?: string }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!viewerId) { location.href = `/login?next=${encodeURIComponent(`/community/posts/${postId}`)}`; return; }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body }) });
      const comment = await response.json();
      if (!response.ok) {
        if (comment.code === "profile_required") location.href = `/settings/buddy-profile?next=${encodeURIComponent(`/community/posts/${postId}`)}`;
        throw new Error(comment.error ?? "回应发送失败");
      }
      setComments((items) => [...items, comment]);
      setBody("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回应发送失败");
    } finally {
      setBusy(false);
    }
  }
  return <section className="community-comments"><div className="community-comments-title"><div><p className="eyebrow">CONVERSATION</p><h2>城里的回应</h2></div><span><MessageCircle aria-hidden="true" size={15} />{comments.length}</span></div><form onSubmit={submit}><label><span className="sr-only">回应内容</span><textarea maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder={viewerId ? "留下一句有用、友善的回应…" : "登录后参与讨论"} readOnly={!viewerId} required value={body} /><small>{body.length} / 1000</small></label><button disabled={busy} type="submit"><Send aria-hidden="true" size={15} />{busy ? "发送中" : "回应"}</button></form>{error ? <p className="community-comments-error" role="alert">{error}</p> : null}<div className="community-comment-list">{comments.length ? comments.map((comment) => <article key={comment.id}><UserAvatar avatarUrl={comment.author?.avatarUrl} className="community-avatar small" identity={comment.author?.userId ?? comment.id} name={comment.author?.displayName ?? "城市居民"} /><div><strong>{comment.author?.displayName ?? "城市居民"}</strong><p>{comment.body}</p><time>{new Date(comment.publishedAt).toLocaleString("zh-CN")}</time></div></article>) : <div className="community-comments-empty"><MessageCircle aria-hidden="true" size={20} /><span>还没有回应，留下一句有用的话。</span></div>}</div></section>;
}
