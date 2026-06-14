import assert from "node:assert/strict";
import test from "node:test";
import { __testing as candidateRecallTesting } from "@/server/recommendation/candidates";
import { assessCandidateQuality } from "@/server/recommendation/quality";
import { selectTrafficCandidatesForEnrichment } from "@/server/recommendation/recommend";
import { applySignalBackedContext } from "@/server/recommendation/signal-fusion";
import { buildRoutes } from "@/server/recommendation/route-builder";
import { scoreCandidate } from "@/server/recommendation/scoring";
import type {
  Candidate,
  RecommendInput,
  SourceSignal,
  TrafficCandidate
} from "@/server/recommendation/types";

const request: RecommendInput = {
  city: "上海",
  area: "静安",
  origin: {
    lat: 31.224,
    lng: 121.459
  },
  interests: ["咖啡", "展览", "书店", "独立音乐"],
  mood: "solo",
  budget: "medium",
  timeWindow: "tonight",
  useRealtimeTraffic: false,
  useSocialSignals: true
};

function signal(source: string, score = 70): SourceSignal {
  return {
    source,
    label: `${source} 信号`,
    score,
    evidence: "测试信号"
  };
}

function candidate(input: Partial<Candidate> & Pick<Candidate, "id" | "name" | "tags">): Candidate {
  return {
    type: "venue",
    city: "上海",
    area: "静安",
    address: `${input.name} 地址`,
    lat: 31.224,
    lng: 121.459,
    source: "amap-poi",
    sourceSignals: [signal("amap-poi", 68)],
    trendScore: 55,
    confidence: 70,
    freshnessScore: 72,
    popularity: 55,
    quietness: 60,
    priceLevel: 2,
    recallChannels: ["base", "tag"],
    textRelevance: 75,
    ...input
  };
}

function trafficCandidate(base: Candidate, score: number): TrafficCandidate {
  const scored = scoreCandidate(base, request);

  return {
    ...scored,
    baseScore: score,
    adjustedScore: score,
    traffic: {
      estimatedDurationMinutes: 18,
      mode: "transit",
      provider: "estimated",
      congestion: "smooth"
    }
  };
}

test("candidate quality marks generic social listicles as signal-only", () => {
  const generic = assessCandidateQuality({
    name: "上海7月33个活动合集🔥市集&快闪&展览",
    type: "event",
    source: "xiaohongshu",
    tags: ["咖啡", "展览", "市集"]
  });
  const actionable = assessCandidateQuality({
    name: "具体咖啡馆",
    type: "venue",
    source: "amap-poi",
    address: "南京西路 100 号",
    lat: 31.224,
    lng: 121.459,
    tags: ["咖啡", "安静"]
  });
  const concreteXiaohongshu = assessCandidateQuality({
    name: "眠羊咖啡",
    type: "venue",
    source: "xiaohongshu",
    address: "愚园路 300 号",
    lat: 31.224,
    lng: 121.459,
    tags: ["咖啡", "安静"]
  });

  assert.equal(generic.routeEligible, false);
  assert.ok(generic.qualityScore < 30);
  assert.ok(generic.qualityFlags.includes("generic_social"));
  assert.ok(generic.qualityFlags.includes("missing_address"));
  assert.ok(generic.qualityFlags.includes("missing_coords"));
  assert.equal(actionable.routeEligible, true);
  assert.ok(actionable.qualityScore >= 85);
  assert.equal(concreteXiaohongshu.routeEligible, false);
  assert.ok(concreteXiaohongshu.qualityFlags.includes("social_signal_only"));
});

test("candidate recall recomputes stale default quality for actionable AMap POIs", () => {
  const amapQuality = candidateRecallTesting.candidateQuality({
    name: "万有集市(静安店)",
    type: "venue",
    source: "amap-poi",
    address: "普济路45号",
    lat: 31.242,
    lng: 121.454,
    tags: ["市集", "购物"],
    row: {
      qualityScore: 50,
      qualityFlags: []
    }
  });
  const xhsQuality = candidateRecallTesting.candidateQuality({
    name: "小红书直出咖啡店",
    type: "venue",
    source: "xiaohongshu",
    address: "愚园路300号",
    lat: 31.224,
    lng: 121.459,
    tags: ["咖啡"],
    row: {
      qualityScore: 100,
      qualityFlags: []
    }
  });

  assert.equal(amapQuality.routeEligible, true);
  assert.ok(amapQuality.qualityScore >= 85);
  assert.equal(xhsQuality.routeEligible, false);
  assert.ok(xhsQuality.qualityFlags.includes("social_signal_only"));
});

test("actionable places absorb matching city signals without adding route places", () => {
  const [fused] = applySignalBackedContext(
    [
      candidate({
        id: "venue-cafe",
        name: "具体咖啡馆",
        tags: ["咖啡", "安静"],
        qualityScore: 95,
        routeEligible: true
      })
    ],
    [
      {
        id: "signal-xhs-cafe",
        city: "上海",
        area: "静安",
        tag: "咖啡",
        heatScore: 92,
        source: "xiaohongshu",
        matchedVenueIds: ["venue-cafe"],
        metadata: {
          title: "静安咖啡热度上升",
          sourceKey: "xiaohongshu:note-a"
        }
      },
      {
        city: "上海",
        area: "黄浦",
        tag: "咖啡",
        heatScore: 99,
        source: "xiaohongshu",
        metadata: {
          title: "黄浦咖啡榜单"
        }
      }
    ],
    request
  );

  assert.equal(fused.id, "venue-cafe");
  assert.equal(fused.signalStrength, 92);
  assert.equal(fused.sourceSignals.some((item) => item.source === "xiaohongshu"), true);
});

test("Xiaohongshu signals without confirmed AMap venue matches do not back routes", () => {
  const [fused] = applySignalBackedContext(
    [
      candidate({
        id: "venue-cafe",
        name: "具体咖啡馆",
        tags: ["咖啡", "安静"],
        qualityScore: 95,
        routeEligible: true
      })
    ],
    [
      {
        id: "signal-xhs-unmatched",
        city: "上海",
        area: "静安",
        tag: "咖啡",
        heatScore: 96,
        source: "xiaohongshu",
        matchedVenueIds: [],
        metadata: {
          title: "静安咖啡热度上升",
          sourceKey: "xiaohongshu:note-unmatched"
        }
      }
    ],
    request
  );

  assert.equal(fused.signalStrength, 55);
  assert.equal(fused.sourceSignals.some((item) => item.source === "xiaohongshu"), false);
});

test("Xiaohongshu confirmed matches only apply to their reviewed AMap venue", () => {
  const fused = applySignalBackedContext(
    [
      candidate({
        id: "venue-reviewed",
        name: "已审查咖啡馆",
        tags: ["咖啡"],
        qualityScore: 95,
        routeEligible: true
      }),
      candidate({
        id: "venue-tag-peer",
        name: "同标签咖啡馆",
        tags: ["咖啡"],
        qualityScore: 95,
        routeEligible: true
      })
    ],
    [
      {
        id: "signal-xhs-reviewed",
        city: "上海",
        area: "静安",
        tag: "咖啡",
        heatScore: 94,
        source: "xiaohongshu",
        matchedVenueIds: ["venue-reviewed"],
        metadata: {
          title: "已审查咖啡馆热度上升",
          sourceKey: "xiaohongshu:note-reviewed"
        }
      }
    ],
    request
  );

  assert.equal(fused.find((item) => item.id === "venue-reviewed")?.signalStrength, 94);
  assert.equal(fused.find((item) => item.id === "venue-tag-peer")?.signalStrength, 55);
});

test("generic social listicle signals are not exposed as route evidence", () => {
  const [fused] = applySignalBackedContext(
    [
      candidate({
        id: "venue-cafe",
        name: "具体咖啡馆",
        tags: ["咖啡", "安静"],
        qualityScore: 95,
        routeEligible: true
      })
    ],
    [
      {
        city: "上海",
        area: "静安",
        tag: "咖啡",
        heatScore: 99,
        source: "xiaohongshu",
        metadata: {
          title: "上海) 个人觉得无法超越的9️⃣个地方……….."
        }
      }
    ],
    request
  );

  assert.equal(fused.signalStrength, 55);
  assert.equal(
    fused.sourceSignals.some((item) => item.evidence?.includes("无法超越")),
    false
  );
});

test("social signals must mention the matched tag before backing a route", () => {
  const [fused] = applySignalBackedContext(
    [
      candidate({
        id: "venue-gallery",
        name: "具体画廊",
        tags: ["展览", "艺术"],
        qualityScore: 95,
        routeEligible: true
      })
    ],
    [
      {
        city: "上海",
        area: "静安",
        tag: "展览",
        heatScore: 88,
        source: "xiaohongshu",
        metadata: {
          title: "上海最难绷的店名"
        }
      }
    ],
    request
  );

  assert.equal(fused.signalStrength, 55);
  assert.equal(
    fused.sourceSignals.some((item) => item.evidence?.includes("最难绷")),
    false
  );
});

test("weighted ranker v1.1 uses fused signal strength and records quality features", () => {
  const scored = scoreCandidate(
    candidate({
      id: "venue-signal-backed",
      name: "静安信号咖啡馆",
      tags: ["咖啡", "安静"],
      trendScore: 50,
      signalStrength: 94,
      qualityScore: 95,
      qualityFlags: [],
      routeEligible: true
    }),
    request
  );

  assert.equal(scored.rankerVersion, "weighted-v1.2-profile");
  assert.ok(scored.scoreBreakdown.socialTrend >= 90);
  assert.equal(scored.features.qualityScore, 95);
  assert.deepEqual(scored.features.qualityFlags, []);
  assert.equal(scored.features.routeEligible, true);
});

test("route assembler keeps generic social listicles out when eligible places exist", () => {
  const generic = trafficCandidate(
    candidate({
      id: "event-generic",
      name: "上海7月33个活动合集🔥市集&快闪&展览",
      type: "event",
      source: "xiaohongshu",
      address: undefined,
      lat: undefined,
      lng: undefined,
      tags: ["咖啡", "展览", "市集"],
      qualityScore: 12,
      qualityFlags: ["generic_social", "missing_address", "missing_coords"],
      routeEligible: false
    }),
    99
  );
  const routes = buildRoutes(
    [
      generic,
      trafficCandidate(candidate({ id: "venue-cafe", name: "具体咖啡馆", tags: ["咖啡"] }), 88),
      trafficCandidate(candidate({ id: "venue-book", name: "独立书店", tags: ["书店", "安静"] }), 84),
      trafficCandidate(candidate({ id: "event-gallery", name: "小型展览", type: "event", tags: ["展览", "艺术"] }), 82),
      trafficCandidate(candidate({ id: "venue-music", name: "Livehouse", tags: ["独立音乐", "夜生活"] }), 80)
    ],
    request
  );
  const placeIds = routes.flatMap((route) => route.places.map((place) => place.id));

  assert.ok(routes.length > 0);
  assert.equal(placeIds.includes("event-generic"), false);
});

test("traffic enrichment candidate pool prioritizes route-eligible places over signal-only notes", () => {
  const signalOnly = Array.from({ length: 24 }, (_, index) =>
    scoreCandidate(
      candidate({
        id: `social-note-${index}`,
        name: `上海咖啡展览周末灵感 ${index}`,
        type: "event",
        source: "xiaohongshu",
        address: undefined,
        lat: undefined,
        lng: undefined,
        tags: ["咖啡", "展览"],
        trendScore: 98,
        freshnessScore: 96,
        popularity: 96,
        qualityScore: 10,
        qualityFlags: ["missing_address", "missing_coords"],
        routeEligible: false,
        signalStrength: 98
      }),
      request
    )
  ).map((item, index) => ({
    ...item,
    baseScore: 95 - index * 0.1
  }));
  const eligible = Array.from({ length: 5 }, (_, index) =>
    scoreCandidate(
      candidate({
        id: `eligible-place-${index}`,
        name: `可执行咖啡展览地点 ${index}`,
        source: index % 2 === 0 ? "amap-poi" : "shanghai-gov",
        tags: ["咖啡", "展览"],
        address: `南京西路 ${index + 1} 号`,
        lat: 31.224 + index * 0.001,
        lng: 121.459 + index * 0.001,
        qualityScore: 95,
        qualityFlags: [],
        routeEligible: true,
        signalStrength: 72
      }),
      request
    )
  ).map((item, index) => ({
    ...item,
    baseScore: 70 - index
  }));
  const ranked = [...signalOnly, ...eligible].sort((a, b) => b.baseScore - a.baseScore);

  const selected = selectTrafficCandidatesForEnrichment(ranked, 20);

  assert.equal(selected.length, 20);
  assert.deepEqual(
    selected.slice(0, eligible.length).map((item) => item.id),
    eligible.map((item) => item.id)
  );
  assert.equal(
    selected.filter((item) => item.features.routeEligible === true).length,
    eligible.length
  );
});

test("candidate recall window preserves actionable candidates under noisy social volume", () => {
  const signalOnly = Array.from({ length: 40 }, (_, index) =>
    candidate({
      id: `noisy-social-${index}`,
      name: `高热视频 ${index}`,
      source: "xiaohongshu",
      address: undefined,
      lat: undefined,
      lng: undefined,
      tags: ["咖啡", "展览"],
      trendScore: 95 - index * 0.1,
      qualityScore: 10,
      qualityFlags: ["missing_address", "missing_coords"],
      routeEligible: false
    })
  );
  const actionable = Array.from({ length: 6 }, (_, index) =>
    candidate({
      id: `actionable-${index}`,
      name: `可执行地点 ${index}`,
      source: "amap-poi",
      tags: ["咖啡"],
      trendScore: 50,
      qualityScore: 95,
      qualityFlags: [],
      routeEligible: true
    })
  );

  const selected = candidateRecallTesting.selectCandidateRecallWindow(
    [...signalOnly, ...actionable],
    20
  );

  assert.deepEqual(
    selected.slice(0, actionable.length).map((item) => item.id),
    actionable.map((item) => item.id)
  );
});

test("route assembler returns short executable routes instead of signal-only fallback", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(
        candidate({
          id: "eligible-place",
          name: "唯一可执行咖啡馆",
          tags: ["咖啡"],
          qualityScore: 95,
          qualityFlags: [],
          routeEligible: true
        }),
        70
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        trafficCandidate(
          candidate({
            id: `signal-only-${index}`,
            name: `上海咖啡展览灵感笔记 ${index}`,
            type: "event",
            source: "xiaohongshu",
            address: undefined,
            lat: undefined,
            lng: undefined,
            tags: ["咖啡", "展览"],
            qualityScore: 10,
            qualityFlags: ["missing_address", "missing_coords"],
            routeEligible: false
          }),
          95 - index
        )
      )
    ],
    request
  );
  const places = routes.flatMap((route) => route.places);

  assert.ok(routes.length > 0);
  assert.deepEqual(
    places.map((place) => place.id),
    ["eligible-place"]
  );
});

test("route assembler prefers coherent themes over loose cross-theme mashups", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(candidate({ id: "venue-book", name: "独立书店", tags: ["书店", "安静", "文化"] }), 92),
      trafficCandidate(candidate({ id: "venue-cafe", name: "安静咖啡", tags: ["咖啡", "安静"] }), 90),
      trafficCandidate(candidate({ id: "event-gallery", name: "小型展览", type: "event", tags: ["展览", "艺术", "文化"] }), 88),
      trafficCandidate(candidate({ id: "venue-livehouse", name: "Livehouse", tags: ["独立音乐", "夜生活"] }), 87),
      trafficCandidate(candidate({ id: "venue-bar", name: "音乐酒吧", tags: ["酒吧", "夜生活", "独立音乐"] }), 86)
    ],
    request
  );
  const mixedRoute = routes.find((route) => {
    const tags = route.places.flatMap((place) => place.tags);
    return tags.includes("书店") && tags.includes("夜生活");
  });

  assert.equal(mixedRoute, undefined);
});

test("route assembler preserves requested market food intent when actionable candidates exist", () => {
  const marketRequest: RecommendInput = {
    ...request,
    interests: ["市集", "美食", "咖啡"],
    budget: "low",
    timeWindow: "weekend"
  };
  const routes = buildRoutes(
    [
      trafficCandidate(
        candidate({
          id: "event-market-food",
          name: "第二届拉丁热浪节",
          type: "event",
          source: "shanghai-gov",
          address: "虹桥新天地南区灵感花园",
          lat: undefined,
          lng: undefined,
          tags: ["美食市集", "咖啡品鉴", "葡萄酒", "文化演出"],
          qualityScore: 58,
          qualityFlags: ["missing_coords"],
          routeEligible: true,
          textRelevance: 100,
          signalStrength: 88
        }),
        79
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        trafficCandidate(
          candidate({
            id: `venue-cafe-${index}`,
            name: `近处咖啡店 ${index}`,
            tags: ["咖啡", "咖啡厅", "餐饮"],
            lat: 31.224 + index * 0.001,
            lng: 121.459 + index * 0.001,
            qualityScore: 100,
            qualityFlags: [],
            routeEligible: true
          }),
          76 - index
        )
      )
    ],
    marketRequest
  );
  const routeTags = routes.map((route) => route.places.flatMap((place) => place.tags).join(" "));

  assert.ok(routeTags.some((tags) => tags.includes("市集") && tags.includes("美食")));
});

test("route assembler orders route places from the origin when possible", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(
        candidate({
          id: "venue-far",
          name: "远处书店",
          tags: ["书店"],
          lat: 31.29,
          lng: 121.51
        }),
        92
      ),
      trafficCandidate(
        candidate({
          id: "venue-near",
          name: "近处咖啡",
          tags: ["咖啡"],
          lat: 31.2242,
          lng: 121.4592
        }),
        90
      )
    ],
    request
  );

  assert.equal(routes[0]?.places[0]?.id, "venue-near");
});

test("route assembler avoids same-address venue variants when alternatives exist", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(
        candidate({
          id: "event-expo-a",
          name: "上海展览中心西一馆W1",
          type: "event",
          address: "延安中路1000号上海展览中心",
          tags: ["展览", "文化场馆"],
          lat: 31.229,
          lng: 121.455
        }),
        94
      ),
      trafficCandidate(
        candidate({
          id: "event-expo-b",
          name: "上海展览中心友谊会堂",
          type: "event",
          address: "延安中路1000号(静安寺地铁站8号口步行340米)",
          tags: ["展览", "文化场馆"],
          lat: 31.2291,
          lng: 121.4551
        }),
        93
      ),
      trafficCandidate(
        candidate({
          id: "venue-cafe",
          name: "安静咖啡",
          address: "西康路255号",
          tags: ["咖啡", "安静"],
          lat: 31.225,
          lng: 121.458
        }),
        88
      )
    ],
    request
  );
  const sameAddressRoute = routes.find((route) => {
    const names = route.places.map((place) => place.name).join(" / ");

    return names.includes("上海展览中心西一馆W1") && names.includes("上海展览中心友谊会堂");
  });

  assert.equal(sameAddressRoute, undefined);
});

test("route assembler avoids reusing same place clusters across returned routes", () => {
  const routes = buildRoutes(
    [
      trafficCandidate(
        candidate({
          id: "event-expo-a",
          name: "上海展览中心西一馆W1",
          type: "event",
          address: "延安中路1000号上海展览中心",
          tags: ["展览", "文化场馆"],
          lat: 31.229,
          lng: 121.455
        }),
        94
      ),
      trafficCandidate(
        candidate({
          id: "event-expo-b",
          name: "上海展览中心友谊会堂",
          type: "event",
          address: "延安中路1000号(静安寺地铁站8号口步行340米)",
          tags: ["展览", "文化场馆"],
          lat: 31.2291,
          lng: 121.4551
        }),
        93
      ),
      trafficCandidate(candidate({ id: "venue-cafe", name: "安静咖啡", tags: ["咖啡", "安静"] }), 91),
      trafficCandidate(candidate({ id: "venue-book", name: "独立书店", tags: ["书店", "文化"] }), 89),
      trafficCandidate(candidate({ id: "venue-flower", name: "花艺咖啡", tags: ["咖啡", "花艺"] }), 87)
    ],
    request
  );
  const names = routes.flatMap((route) => route.places.map((place) => place.name));

  assert.ok(!(names.includes("上海展览中心西一馆W1") && names.includes("上海展览中心友谊会堂")));
});
