"use client";

import { useState } from "react";
import type { CommunityPostView } from "@/server/community/types";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";

export function CommunityFeed({ initialPosts, initialCursor, city, viewerId }: { initialPosts: CommunityPostView[]; initialCursor: string | null; city: string; viewerId?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/community/feed?city=${encodeURIComponent(city)}&cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setPosts((current) => [...current, ...data.posts]);
      setCursor(data.nextCursor);
    } finally { setLoading(false); }
  }
  return <div className="community-feed-wrap">
    <div className="community-feed-heading"><div><p className="eyebrow">LIVE JOURNAL</p><h2>{city}生活流</h2></div><p>{posts.length ? "由此刻生活在城里的人共同书写" : "第一则城市手记，等你写下。"}</p></div>
    <div className="community-feed">{posts.map((post, index) => <CommunityPostCard index={index} key={post.id} post={post} viewerId={viewerId} />)}</div>
    {cursor ? <button className="community-load-more" disabled={loading} onClick={() => void loadMore()} type="button">{loading ? "正在翻开下一页…" : "继续读城市"}</button> : null}
  </div>;
}
