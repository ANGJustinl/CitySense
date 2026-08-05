import type { Route } from "next";
import Link from "next/link";
import type { CommunityPostView } from "@/server/community/types";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { communityFeedContextKey, communityPageHref, type CommunityFeedContext } from "@/lib/community/feed-context";

export function CommunityHub({ initialPosts, nextCursor, city, scope, viewerId }: { initialPosts: CommunityPostView[]; nextCursor: string | null; city: string; scope: "city" | "following"; viewerId?: string }) {
  const context: CommunityFeedContext = { kind: "community", city, scope };
  const followingPage = communityPageHref(city, "following");
  const followingHref = viewerId ? followingPage : `/login?next=${encodeURIComponent(followingPage)}` as Route;
  const copy = scope === "following"
    ? { eyebrow: "FOLLOWING IN CITY", title: `${city} · 我关注的`, populated: `只看你关注的人在${city}发布的城市手记`, empty: `你关注的人暂时还没有在${city}发布城市手记。` }
    : { eyebrow: "LIVE JOURNAL", title: `${city}生活流`, populated: "由此刻生活在城里的人共同书写", empty: "第一则城市手记，等你写下。" };
  return <section className="community-hub"><header className="community-hero"><div className="community-hero-copy"><p className="eyebrow">CITY NOTES · 城市手记</p><h1>把今天的城市，<br />留给同路的人。</h1><p>一间刚发现的小店，一条值得慢慢走的路线，或只是此刻街角的风。这里收集真实的城市生活。</p><div className="community-hero-actions"><a className="primary-button" href={viewerId ? "/community/new" : "/login?next=%2Fcommunity%2Fnew"}>写一则城市手记</a><a className="community-quiet-link" href="/buddy">找路线搭子</a></div></div><div aria-hidden="true" className="community-issue-mark"><span>05</span><strong>AUG</strong><small>城市正在发生</small></div></header><nav className="community-channel-strip" aria-label="社区频道"><Link aria-current={scope === "city" ? "page" : undefined} className={scope === "city" ? "active" : ""} href={communityPageHref(city, "city")}>城市最新</Link><Link aria-current={scope === "following" ? "page" : undefined} className={scope === "following" ? "active" : ""} href={followingHref}>我关注的</Link><a href="/buddy">路线搭子</a><a href={`/community/ranking?city=${encodeURIComponent(city)}&type=HOT`}>城市榜单</a><a href="/submit-place">地点分享</a>{viewerId ? <a href="/community/bookmarks">我的收藏</a> : null}</nav><CommunityFeed copy={copy} context={context} initialCursor={nextCursor} initialPosts={initialPosts} key={communityFeedContextKey(context)} viewerId={viewerId} /></section>;
}
