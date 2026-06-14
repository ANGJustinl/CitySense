import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoutePersona,
  buildRouteChoiceSummary,
  buildRouteJourneyItems,
  formatRouteLegLabel
} from "@/components/city/route-display";
import type { RecommendedRoute, RouteLeg, ScoreBreakdown } from "@/server/recommendation/types";

const breakdown: ScoreBreakdown = {
  taste: 80,
  textRelevance: 80,
  socialTrend: 80,
  freshness: 80,
  distance: 80,
  traffic: 80,
  timeFit: 80,
  novelty: 80,
  actionability: 80,
  userAffinity: 50,
  feedbackPenalty: 0
};

const sampleLeg: RouteLeg = {
  fromName: "静安寺",
  toName: "咖啡馆",
  toPlaceId: "place-a",
  mode: "transit",
  durationMinutes: 18,
  distanceMeters: 2400,
  provider: "amap",
  transitLines: ["地铁2号线"],
  polyline: [
    [121.446, 31.223],
    [121.459, 31.224]
  ]
};

function sampleRoute(overrides: Partial<RecommendedRoute> = {}): RecommendedRoute {
  return {
    id: "route-1",
    title: "静安 即刻路线",
    summary: "咖啡馆 -> 书店 / 32 分钟可达",
    totalScore: 86,
    scoreBreakdown: breakdown,
    traffic: {
      estimatedDurationMinutes: 32,
      distanceMeters: 4600,
      mode: "transit",
      provider: "amap",
      congestion: "smooth"
    },
    legs: [
      sampleLeg,
      {
        fromName: "咖啡馆",
        toName: "书店",
        toPlaceId: "place-b",
        mode: "walking",
        durationMinutes: 9,
        distanceMeters: 650,
        provider: "estimated",
        polyline: [
          [121.459, 31.224],
          [121.462, 31.226]
        ]
      }
    ],
    sourceSignals: [
      {
        source: "xiaohongshu",
        label: "咖啡热度",
        score: 88
      }
    ],
    places: [
      {
        id: "place-a",
        name: "咖啡馆",
        type: "venue",
        address: "南京西路 1 号",
        tags: ["咖啡"]
      },
      {
        id: "place-b",
        name: "书店",
        type: "venue",
        address: "愚园路 2 号",
        tags: ["书店"]
      }
    ],
    reason: "匹配咖啡与书店",
    tips: [],
    ...overrides
  };
}

test("buildRouteChoiceSummary formats quick route comparison labels", () => {
  assert.deepEqual(buildRouteChoiceSummary(sampleRoute()), {
    durationLabel: "32 min",
    stopCountLabel: "2 站",
    scoreLabel: "86",
    endpointLabel: "咖啡馆 -> 书店",
    signalLabel: "1 信号",
    providerLabel: "高德 ETA"
  });
});

test("formatRouteLegLabel includes duration mode line and distance", () => {
  assert.equal(formatRouteLegLabel(sampleLeg), "18 min · 地铁2号线 · 2.4 km");
  assert.equal(
    formatRouteLegLabel({
      ...sampleLeg,
      mode: "walking",
      provider: "estimated",
      transitLines: undefined,
      distanceMeters: 650
    }),
    "约 18 min · 步行 · 650 m"
  );
});

test("buildRouteJourneyItems includes origin when legs exist and degrades without legs", () => {
  const withLegs = buildRouteJourneyItems(sampleRoute());
  const withoutLegs = buildRouteJourneyItems(sampleRoute({ legs: undefined }));

  assert.equal(withLegs[0].type, "origin");
  assert.equal(withLegs[0].label, "起");
  assert.equal(withLegs[0].title, "静安寺");
  assert.equal(withLegs[1].type, "stop");
  assert.equal(withLegs[1].type === "stop" ? withLegs[1].legLabel : undefined, "18 min · 地铁2号线 · 2.4 km");
  assert.equal(withoutLegs[0].type, "stop");
  assert.equal(withoutLegs[0].label, "1");
  assert.equal(withoutLegs[0].type === "stop" ? withoutLegs[0].legLabel : undefined, undefined);
});

test("buildRoutePersona derives a clear route theme from tags", () => {
  const persona = buildRoutePersona(
    sampleRoute({
      title: "今晚能量线",
      places: [
        {
          id: "livehouse",
          name: "Livehouse",
          type: "venue",
          tags: ["独立音乐", "夜生活", "酒吧"]
        },
        {
          id: "bar",
          name: "音乐酒吧",
          type: "venue",
          tags: ["酒吧"]
        }
      ]
    })
  );

  assert.equal(persona.themeKey, "nightlife");
  assert.equal(persona.themeName, "夜生活能量线");
  assert.deepEqual(persona.tags, ["独立音乐", "夜生活", "酒吧"]);
  assert.equal(persona.representativePlace.name, "Livehouse");
});

test("buildRoutePersona selects an image-backed representative place", () => {
  const persona = buildRoutePersona(
    sampleRoute({
      places: [
        {
          id: "plain",
          name: "普通站点",
          type: "venue",
          tags: ["咖啡"]
        },
        {
          id: "image-place",
          name: "有图咖啡店",
          type: "venue",
          imageUrl: "https://example.com/cafe.jpg",
          tags: ["咖啡", "糕饼"]
        }
      ]
    })
  );

  assert.equal(persona.themeKey, "cafe-food");
  assert.equal(persona.representativePlace.id, "image-place");
  assert.equal(persona.representativePlace.imageUrl, "https://example.com/cafe.jpg");
});

test("buildRoutePersona degrades to city exploration without tags or signals", () => {
  const persona = buildRoutePersona(
    sampleRoute({
      title: "未知路线",
      summary: "",
      reason: "",
      sourceSignals: [],
      places: [
        {
          id: "unknown",
          name: "未知地点",
          type: "venue",
          tags: []
        }
      ]
    })
  );

  assert.equal(persona.themeKey, "city");
  assert.equal(persona.themeName, "城市探索线");
  assert.deepEqual(persona.tags, []);
  assert.equal(persona.topSignal, undefined);
  assert.match(persona.featureText, /暂无来源信号/);
});
