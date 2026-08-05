"use client";

import { useState } from "react";
import type { CommunityPostView } from "@/server/community/types";
import type { CommunityFeedContext } from "@/lib/community/feed-context";
import { communityFeedApiHref } from "@/lib/community/feed-context";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";

type FeedCopy = { eyebrow: string; title: string; populated: string; empty: string };

export function CommunityFeed({ initialPosts, initialCursor, context, viewerId, copy }: { initialPosts: CommunityPostView[]; initialCursor: string | null; context: CommunityFeedContext; viewerId?: string; copy: FeedCopy }) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(communityFeedApiHref(context, cursor));
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setPosts((current) => [...current, ...data.posts]);
      setCursor(data.nextCursor);
    } catch { setError("下一页加载失败，请重试。"); }
    finally { setLoading(false); }
  }
  return <div className="community-feed-wrap">
    <div className="community-feed-heading"><div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div><p>{posts.length ? copy.populated : copy.empty}</p></div>
    <div className="community-feed">{posts.map((post, index) => <CommunityPostCard index={index} key={post.id} post={post} viewerId={viewerId} />)}</div>
    {error ? <p className="community-feed-error" role="alert">{error}</p> : null}
    {cursor ? <button className="community-load-more" disabled={loading} onClick={() => void loadMore()} type="button">{loading ? "正在翻开下一页…" : error ? "重新加载" : "继续读城市"}</button> : null}
  </div>;
}
