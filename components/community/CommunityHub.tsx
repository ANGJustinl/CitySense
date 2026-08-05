import type { CommunityPostView } from "@/server/community/types";
import { CommunityFeed } from "@/components/community/CommunityFeed";

export function CommunityHub({ initialPosts, nextCursor, city, viewerId }: { initialPosts: CommunityPostView[]; nextCursor: string | null; city: string; viewerId?: string }) {
  return (
    <section className="community-hub">
      <header className="community-hero">
        <div className="community-hero-copy">
          <p className="eyebrow">CITY NOTES · 城市手记</p>
          <h1>把今天的城市，<br />留给同路的人。</h1>
          <p>一间刚发现的小店，一条值得慢慢走的路线，或只是此刻街角的风。这里收集真实的城市生活。</p>
          <div className="community-hero-actions">
            <a className="primary-button" href={viewerId ? "/community/new" : "/login?next=%2Fcommunity%2Fnew"}>写一则城市手记</a>
            <a className="community-quiet-link" href="/buddy">找路线搭子</a>
          </div>
        </div>
        <div aria-hidden="true" className="community-issue-mark"><span>05</span><strong>AUG</strong><small>城市正在发生</small></div>
      </header>
      <nav className="community-channel-strip" aria-label="社区频道">
        <span className="active">城市最新</span>
        <a href={viewerId ? `/community?scope=following&city=${encodeURIComponent(city)}` : "/login?next=%2Fcommunity%3Fscope%3Dfollowing"}>我关注的</a>
        <a href="/buddy">路线搭子</a>
        <a href="/submit-place">地点分享</a>
        {viewerId ? <a href="/community/bookmarks">我的收藏</a> : null}
      </nav>
      <CommunityFeed city={city} initialCursor={nextCursor} initialPosts={initialPosts} viewerId={viewerId} />
    </section>
  );
}
