"use client";

import { useState } from "react";
import type { CommunityCommentView } from "@/server/community/types";
import { UserAvatar } from "@/components/UserAvatar";

export function CommunityComments({ postId, initialComments, viewerId }: { postId: string; initialComments: CommunityCommentView[]; viewerId?: string }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!viewerId) { location.href = `/login?next=${encodeURIComponent(`/community/posts/${postId}`)}`; return; }
    setBusy(true);
    const response = await fetch(`/api/community/posts/${postId}/comments`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body }) });
    if (response.ok) {
      const comment = await response.json();
      setComments((items) => [...items, comment]);
      setBody("");
    }
    setBusy(false);
  }
  return <section className="community-comments"><div className="community-comments-title"><p className="eyebrow">CONVERSATION</p><h2>城里的回应</h2><span>{comments.length}</span></div><form onSubmit={submit}><textarea maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder={viewerId ? "留下一句有用、友善的回应…" : "登录后参与讨论"} readOnly={!viewerId} required value={body} /><button disabled={busy} type="submit">{busy ? "发送中" : "回应"}</button></form><div className="community-comment-list">{comments.map((comment) => <article key={comment.id}><UserAvatar avatarUrl={comment.author?.avatarUrl} className="community-avatar small" identity={comment.author?.userId ?? comment.id} name={comment.author?.displayName ?? "城市居民"} /><div><strong>{comment.author?.displayName ?? "城市居民"}</strong><p>{comment.body}</p><time>{new Date(comment.publishedAt).toLocaleString("zh-CN")}</time></div></article>)}</div></section>;
}
