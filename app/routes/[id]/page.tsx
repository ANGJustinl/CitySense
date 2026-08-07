import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { RouteDetailCommercial } from "@/components/city/RouteDetailCommercial";
import { getOptionalUser } from "@/server/auth/current-user";
import { getRouteDetailRecord } from "@/server/routes/route-detail";

export const dynamic = "force-dynamic";

export default async function RouteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, user] = await Promise.all([getRouteDetailRecord(id), getOptionalUser()]);
  const viewer = user ? { id: user.appUser.id, email: user.authUser.email ?? null, role: user.appUser.role } : null;

  if (!detail) {
    return (
      <main className="product-page route-missing-page">
        <ProductHeader active="routes" variant="page" viewer={viewer} />
        <section className="route-empty-state">
          <MapPinned size={28} />
          <p className="product-kicker">ROUTE DETAIL</p>
          <h1>路线不存在</h1>
          <p>当前链接没有匹配到推荐快照，请回到地图重新生成路线。</p>
          <Link className="product-button primary" href="/"><ArrowLeft size={16} />返回路线地图</Link>
        </section>
      </main>
    );
  }

  const ownerId = detail.recommendation.ownerUserId;
  const ownsRoute = Boolean(viewer && ownerId && viewer.id === ownerId);

  return (
    <RouteDetailCommercial
      city={detail.recommendation.input.city ?? "北京"}
      map={detail.map}
      ownsRoute={ownsRoute}
      recommendationId={detail.recommendation.id}
      route={detail.route}
      viewer={viewer}
    />
  );
}
