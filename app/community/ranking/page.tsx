import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityRankingBoard } from "@/components/community/CommunityRankingBoard";
import { isCommunityEnabled } from "@/server/config/ugc";
import { listVenueRanking } from "@/server/community/votes";
import { getOptionalUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ city?: string; type?: "NICHE" | "HOT"; area?: string }> }) {
  if (!isCommunityEnabled()) {
    return (
      <main className="community-disabled">
        <p className="eyebrow">CITY RANKING</p>
        <h1>榜单正在筹备</h1>
        <p>城市地点排行榜即将上线，敬请期待。</p>
        <Link href="/"><ArrowLeft size={16} />返回城市脉搏</Link>
      </main>
    );
  }
  const params = await searchParams;
  const viewer = await getOptionalUser();
  const city = params.city ?? "北京";
  const type = params.type ?? "HOT";
  const ranking = await listVenueRanking({ city, type, area: params.area, limit: 20, viewerId: viewer?.appUser.id });
  return (
    <main className="community-page-shell">
      <nav className="community-page-nav">
        <Link href="/community"><ArrowLeft size={16} />社区</Link>
        <span>{city} · 城市榜单</span>
      </nav>
      <CommunityRankingBoard
        city={city}
        type={type}
        area={params.area}
        initialEntries={ranking.entries}
        nextCursor={ranking.nextCursor}
        viewerId={viewer?.appUser.id}
      />
    </main>
  );
}
