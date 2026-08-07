import { BuddyHub, type BuddyPublishRoute } from "@/components/buddy/BuddyHub";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getBuddyProfile } from "@/server/buddy/service";
import { buildBuddyRouteSnapshot } from "@/server/buddy/route-snapshot";
import { getRouteDetailRecord } from "@/server/routes/route-detail";
import { parseBuddyCompose, parseBuddyTab } from "@/lib/buddy-navigation";

export const dynamic = "force-dynamic";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ routeId?: string; compose?: string; tab?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const routeId = params.routeId;
  const profile = await getBuddyProfile(user.appUser.id);
  let route: BuddyPublishRoute | undefined;
  if (routeId) {
    const detail = await getRouteDetailRecord(routeId);
    route = !detail
      ? { status: "missing", id: routeId }
      : detail.recommendation.ownerUserId !== user.appUser.id
        ? { status: "not-owned", id: routeId, title: detail.route.title }
        : { status: "ready", route: buildBuddyRouteSnapshot(detail) };
  }
  return (
    <main className="buddy-page-shell">
      <ProductPageHeader active="buddy" />
      <BuddyHub initialCompose={parseBuddyCompose(params.compose)} initialTab={parseBuddyTab(params.tab)} profileReady={Boolean(profile)} route={route} viewerId={user.appUser.id} />
    </main>
  );
}
