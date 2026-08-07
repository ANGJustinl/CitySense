import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityComposer } from "@/components/community/CommunityComposer";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { requireUser } from "@/server/auth/current-user";
import { resolveBuddyRouteSnapshot } from "@/server/buddy/route-snapshot";

export const dynamic = "force-dynamic";

export default async function NewCommunityPostPage({ searchParams }: { searchParams: Promise<{ routeId?: string; city?: string }> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  let initialRoute: { id: string; title: string; summary: string } | undefined;
  let initialRouteError: string | undefined;
  if (params.routeId) {
    try {
      const { snapshot } = await resolveBuddyRouteSnapshot(params.routeId, user.appUser.id);
      initialRoute = { id: params.routeId, title: snapshot.title, summary: snapshot.summary };
    } catch {
      initialRouteError = "这条路线已失效或不属于当前账户，请重新选择";
    }
  }
  return <main className="community-page-shell editor-page"><ProductPageHeader active="community" city={params.city ?? "北京"} /><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>公开发布 · 后审</span></nav><CommunityComposer defaultCity={params.city ?? "北京"} initialRoute={initialRoute} initialRouteError={initialRouteError} viewerId={user.appUser.id} /></main>;
}
