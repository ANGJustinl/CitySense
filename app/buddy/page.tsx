import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import { BuddyHub, type BuddyPublishRoute } from "@/components/buddy/BuddyHub";
import { requireUser } from "@/server/auth/current-user";
import { getBuddyProfile } from "@/server/buddy/service";
import { getRouteDetailRecord } from "@/server/routes/route-detail";
import { parseBuddyCompose, parseBuddyTab } from "@/lib/buddy-navigation";

export const dynamic = "force-dynamic";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ routeId?: string; compose?: string; tab?: string }> }) {
  const user = await requireUser(); const params = await searchParams; const routeId = params.routeId;
  const profile = await getBuddyProfile(user.appUser.id); let route: BuddyPublishRoute | undefined;
  if (routeId) { const detail = await getRouteDetailRecord(routeId); route = !detail ? { status: "missing", id: routeId } : detail.recommendation.ownerUserId !== user.appUser.id ? { status: "not-owned", id: routeId, title: detail.route.title } : { status: "ready", id: routeId, title: detail.route.title, summary: detail.route.summary }; }
  return <main className="buddy-page-shell"><nav className="buddy-page-nav"><Link href="/"><ArrowLeft size={16} />返回城市脉搏</Link><Link href="/settings/buddy-profile">公开资料</Link></nav><BuddyHub initialCompose={parseBuddyCompose(params.compose)} initialTab={parseBuddyTab(params.tab)} profileReady={Boolean(profile)} route={route} />{routeId ? <p className="buddy-route-filter"><Route size={15} />当前只展示同一条推荐路线的组队</p> : null}</main>;
}
