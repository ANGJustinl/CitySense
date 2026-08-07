"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import type { RouteMapView } from "@/server/routes/route-detail";
import type { AuthViewer } from "@/components/auth/AuthNavigation";
import { ProductHeader } from "@/components/ProductHeader";
import { RouteBuddySheet } from "@/components/buddy/RouteBuddySheet";
import { RouteActionBar } from "@/components/city/RouteActionBar";
import { RouteDetailMap } from "@/components/city/RouteDetailMap";
import { RouteFeedbackPrompt } from "@/components/city/RouteFeedbackPrompt";
import { RouteInspector } from "@/components/city/RouteInspector";

type RouteDetailCommercialProps = {
  route: RecommendedRoute;
  map: RouteMapView;
  recommendationId: string;
  city: string;
  viewer: AuthViewer;
  ownsRoute: boolean;
};

export function RouteDetailCommercial({ route, map, recommendationId, city, viewer, ownsRoute }: RouteDetailCommercialProps) {
  const [buddyOpen, setBuddyOpen] = useState(false);

  return (
    <main className="route-commercial-page">
      <ProductHeader active="routes" city={city} variant="page" viewer={viewer} />
      <section className="route-commercial-layout">
        <div className="route-commercial-map">
          <RouteDetailMap map={map} />
          <Link className="route-commercial-back" href="/"><ArrowLeft size={16} />返回路线地图</Link>
        </div>
        <aside className="route-commercial-rail">
          <div className="route-commercial-scroll">
            <RouteInspector onSelectRoute={() => undefined} routes={[route]} selectedRouteId={route.id} />
            {!ownsRoute ? (
              <div className="route-public-notice">
                <p className="product-kicker">PUBLIC ROUTE</p>
                <strong>这是朋友分享的路线</strong>
                <p>你可以浏览与分享；重新生成后，收藏和找搭子会归属到你的账户。</p>
                <Link className="product-button quiet" href={`/?city=${encodeURIComponent(city)}` as Route}><RefreshCw size={16} />生成相似路线</Link>
              </div>
            ) : (
              <RouteFeedbackPrompt recommendationId={recommendationId} routeId={route.id} userId={viewer?.id} />
            )}
          </div>
          <RouteActionBar
            buddyDisabled={!ownsRoute}
            buddyLabel={ownsRoute ? undefined : "先生成我的路线"}
            canBuddy={Boolean(viewer) && ownsRoute}
            onBuddyRequest={() => setBuddyOpen(true)}
            recommendationId={ownsRoute ? recommendationId : undefined}
            route={route}
            userId={viewer?.id}
          />
        </aside>
      </section>
      {buddyOpen && ownsRoute ? (
        <RouteBuddySheet
          onClose={() => setBuddyOpen(false)}
          onCreated={(result) => {
            window.location.href = result.groupId ? `/buddy/groups/${result.groupId}` : `/buddy?routeId=${encodeURIComponent(route.id)}&tab=mine`;
          }}
          route={{ id: route.id, title: route.title, summary: route.summary, durationLabel: `${route.traffic.estimatedDurationMinutes} 分钟`, stopCount: route.places.length }}
          viewerId={viewer?.id}
        />
      ) : null}
    </main>
  );
}
