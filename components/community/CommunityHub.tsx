import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpenText, MapPin, PenLine, Route as RouteIcon, UsersRound } from "lucide-react";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { communityFeedContextKey, communityPageHref, type CommunityFeedContext } from "@/lib/community/feed-context";
import type { CommunityPostView } from "@/server/community/types";

export function CommunityHub({
  initialPosts,
  nextCursor,
  city,
  scope,
  viewerId,
}: {
  initialPosts: CommunityPostView[];
  nextCursor: string | null;
  city: string;
  scope: "city" | "following";
  viewerId?: string;
}) {
  const context: CommunityFeedContext = { kind: "community", city, scope };
  const followingPage = communityPageHref(city, "following");
  const followingHref = viewerId
    ? followingPage
    : `/login?next=${encodeURIComponent(followingPage)}` as Route;
  const copy = scope === "following"
    ? {
        eyebrow: "FOLLOWING IN CITY",
        title: `${city} · 我关注的`,
        populated: `只看你关注的人在${city}发布的城市手记`,
        empty: `你关注的人暂时还没有在${city}发布城市手记。`,
      }
    : {
        eyebrow: "LIVE JOURNAL",
        title: `${city}生活流`,
        populated: "由此刻生活在城里的人共同书写",
        empty: "第一则城市手记，等你写下。",
      };

  return (
    <section className="community-hub">
      <header className="community-hero">
        <div className="community-hero-copy">
          <div className="community-hero-topline">
            <p className="eyebrow">CITY NOTES · 城市手记</p>
            <span><MapPin size={13} />{city}生活流</span>
          </div>
          <h1>城市手记</h1>
          <p>把今天遇见的店、路线与街角瞬间，留给下一位经过的人。</p>
          <div className="community-hero-actions">
            <a className="primary-button" href={viewerId ? "/community/new" : "/login?next=%2Fcommunity%2Fnew"}>
              <PenLine size={16} />写一则手记
            </a>
            <a className="community-quiet-link" href="/buddy">
              <RouteIcon size={16} />找路线搭子<ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <aside aria-label="城市手记栏目" className="community-issue-mark">
          <p>CITY EDITOR&apos;S DESK</p>
          <strong>{city}编辑部</strong>
          <dl>
            <div><dt><BookOpenText aria-hidden="true" size={15} />本页手记</dt><dd>{initialPosts.length}</dd></div>
            <div><dt><UsersRound aria-hidden="true" size={15} />当前栏目</dt><dd>{scope === "following" ? "关注" : "全城"}</dd></div>
          </dl>
        </aside>
      </header>
      <nav className="community-channel-strip" aria-label="社区频道">
        <Link aria-current={scope === "city" ? "page" : undefined} className={scope === "city" ? "active" : ""} href={communityPageHref(city, "city")}>城市最新</Link>
        <Link aria-current={scope === "following" ? "page" : undefined} className={scope === "following" ? "active" : ""} href={followingHref}>我关注的</Link>
        <a href="/buddy">路线搭子</a>
        <a href={`/community/ranking?city=${encodeURIComponent(city)}&type=HOT`}>城市榜单</a>
        <a href="/submit-place">地点分享</a>
        {viewerId ? <a href="/community/bookmarks">我的收藏</a> : null}
      </nav>
      <CommunityFeed
        copy={copy}
        context={context}
        initialCursor={nextCursor}
        initialPosts={initialPosts}
        key={communityFeedContextKey(context)}
        viewerId={viewerId}
      />
    </section>
  );
}
