import assert from "node:assert/strict";
import test from "node:test";
import {
  attachMomentCards,
  type MomentCardClient
} from "@/server/ai/moment-card";
import type {
  RecommendInput,
  RecommendedRoute,
  ScoreBreakdown
} from "@/server/recommendation/types";

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
  feedbackPenalty: 0,
  exposurePenalty: 0
};

const input: RecommendInput = {
  city: "上海",
  area: "静安",
  interests: ["咖啡", "展览"],
  mood: "solo",
  budget: "medium",
  timeWindow: "tonight",
  useRealtimeTraffic: false,
  useSocialSignals: true
};

function route(overrides: Partial<RecommendedRoute> = {}): RecommendedRoute {
  return {
    id: "route-1",
    title: "静安今晚延展线",
    summary: "上生咖啡 -> 胶囊画廊 / 18 分钟可达",
    totalScore: 88,
    scoreBreakdown: breakdown,
    traffic: {
      estimatedDurationMinutes: 18,
      mode: "transit",
      provider: "estimated",
      congestion: "smooth"
    },
    sourceSignals: [
      {
        source: "xiaohongshu",
        label: "小红书讨论",
        score: 86,
        evidence: "咖啡 / 展览"
      }
    ],
    places: [
      {
        id: "venue-a",
        name: "上生咖啡",
        type: "venue",
        address: "静安寺附近",
        tags: ["咖啡"],
        source: "amap-poi"
      },
      {
        id: "event-b",
        name: "胶囊画廊",
        type: "event",
        address: "南京西路",
        tags: ["展览"],
        source: "damai"
      }
    ],
    momentFit: {
      urgency: "soon",
      arrivalFit: "fits",
      weatherFit: "ok",
      crowdFit: "balanced",
      whyNow: "今晚天气和人流都适合进入路线。",
      facts: [
        { label: "天气", value: "天气不错", source: "citysense-weather" },
        { label: "ETA", value: "18 分钟", source: "estimated" }
      ]
    },
    evidence: {
      placeChecks: [
        {
          placeId: "venue-a",
          label: "高德地点确认",
          source: "amap-poi",
          confidence: 0.9,
          facts: ["地址可用"]
        }
      ],
      sourceFreshness: [
        {
          source: "xiaohongshu",
          label: "刚刷新",
          ageMinutes: 12
        }
      ],
      signalRoles: [
        {
          source: "amap-poi",
          role: "place_authority",
          label: "地点权威"
        },
        {
          source: "xiaohongshu",
          role: "trend_evidence",
          label: "趋势证据"
        }
      ],
      caveats: ["小红书只作为趋势证据，不作为地点权威。"]
    },
    reason: "上生咖啡和胶囊画廊贴合今晚的咖啡、展览偏好。",
    tips: ["先确认营业状态。"],
    ...overrides
  };
}

test("local moment card is generated without an llm client", async () => {
  const [withCard] = await attachMomentCards([route({ momentFit: undefined, evidence: undefined })], input, {
    client: undefined
  });

  assert.equal(withCard.momentCard?.generatedBy, "template");
  assert.ok(withCard.momentCard?.headline.includes("上生咖啡"));
  assert.ok(withCard.momentCard?.message.includes("18 分钟"));
  assert.deepEqual(withCard.momentCard?.citedPlaceIds, ["venue-a"]);
});

test("valid llm moment card replaces the local template", async () => {
  const client: MomentCardClient = {
    async generate() {
      return {
        routes: [
          {
            routeId: "route-1",
            headline: "今晚先去上生咖啡",
            message: "上生咖啡和胶囊画廊都在路线里，天气不错，18 分钟可以抵达。",
            primaryReason: "小红书讨论提供趋势证据。",
            timingHint: "天气: 天气不错",
            nextAction: "先确认营业状态，再按路线出发。",
            confidence: "medium",
            citedPlaceIds: ["venue-a"],
            citedSignalSources: ["xiaohongshu"],
            citedFactLabels: ["天气"]
          }
        ]
      };
    }
  };
  const [withCard] = await attachMomentCards([route()], input, { client, timeoutMs: 1000 });

  assert.equal(withCard.momentCard?.generatedBy, "llm");
  assert.equal(withCard.momentCard?.headline, "今晚先去上生咖啡");
});

test("llm moment card falls back when citations point outside the route", async () => {
  const client: MomentCardClient = {
    async generate() {
      return {
        routes: [
          {
            routeId: "route-1",
            headline: "今晚去不存在咖啡馆",
            message: "不存在咖啡馆很适合今晚出发。",
            primaryReason: "来源看起来很热。",
            nextAction: "直接出发。",
            confidence: "high",
            citedPlaceIds: ["outside-place"],
            citedSignalSources: ["xiaohongshu"],
            citedFactLabels: ["天气"]
          }
        ]
      };
    }
  };
  const [withCard] = await attachMomentCards([route()], input, { client, timeoutMs: 1000 });

  assert.equal(withCard.momentCard?.generatedBy, "template");
  assert.notEqual(withCard.momentCard?.headline, "今晚去不存在咖啡馆");
});

test("llm moment card falls back when output includes a url", async () => {
  const client: MomentCardClient = {
    async generate() {
      return {
        routes: [
          {
            routeId: "route-1",
            headline: "今晚先去上生咖啡",
            message: "上生咖啡适合今晚去，详情见 https://example.com",
            primaryReason: "小红书讨论提供趋势证据。",
            nextAction: "打开链接。",
            confidence: "medium",
            citedPlaceIds: ["venue-a"],
            citedSignalSources: ["xiaohongshu"],
            citedFactLabels: ["天气"]
          }
        ]
      };
    }
  };
  const [withCard] = await attachMomentCards([route()], input, { client, timeoutMs: 1000 });

  assert.equal(withCard.momentCard?.generatedBy, "template");
});

test("llm moment card timeout does not block recommendations", async () => {
  const client: MomentCardClient = {
    async generate() {
      return new Promise(() => {});
    }
  };
  const [withCard] = await attachMomentCards([route()], input, { client, timeoutMs: 5 });

  assert.equal(withCard.momentCard?.generatedBy, "template");
  assert.ok(withCard.momentCard?.headline.includes("上生咖啡"));
});
