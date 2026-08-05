import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CommunityHub } from "@/components/community/CommunityHub";
import { isCommunityEnabled } from "@/server/config/ugc";
import { listCommunityFeed } from "@/server/community/feed";
import { getOptionalUser } from "@/server/auth/current-user";
import { buildAuthPath } from "@/lib/auth/redirect";
import { communityPageHref } from "@/lib/community/feed-context";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ city?: string; scope?: "city" | "following" }> }) {
  if (!isCommunityEnabled()) return <main className="community-disabled"><p className="eyebrow">CITY NOTES</p><h1>社区正在布置中</h1><p>我们正在准备一处适合认真分享城市生活的地方。</p><Link href="/"><ArrowLeft size={16} />返回城市脉搏</Link></main>;
  const params = await searchParams;
  const viewer = await getOptionalUser();
  const city = params.city ?? "北京";
  const scope = params.scope === "following" ? "following" : "city";
  if (scope === "following" && !viewer) redirect(buildAuthPath("login", communityPageHref(city, scope)) as never);
  const feed = await listCommunityFeed({ city, scope, limit: 20, viewerId: viewer?.appUser.id });
  return <main className="community-page-shell"><nav className="community-page-nav"><Link href="/"><ArrowLeft size={16} />城市脉搏</Link><span>{city} · 社区</span></nav><CommunityHub city={city} initialPosts={feed.posts} nextCursor={feed.nextCursor} scope={scope} viewerId={viewer?.appUser.id} /></main>;
}
