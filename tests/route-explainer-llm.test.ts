import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSourceContextItems,
  explainRoutes,
  type RouteExplanationClient
} from "@/server/ai/explain-route";
import type {
  CandidateType,
  RecommendInput,
  RecommendedRoute,
  TrafficCandidate
} from "@/server/recommendation/types";

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

function trafficCandidate(input: {
  id: string;
  name: string;
  type?: CandidateType;
  source?: string;
  sourceUrl?: string;
  tags?: string[];
  score?: number;
}): TrafficCandidate {
  return {
    id: input.id,
    name: input.name,
    type: input.type ?? "venue",
    city: "上海",
    area: "静安",
    address: `${input.name} 地址`,
    tags: input.tags ?? ["咖啡"],
    source: input.source,
    sourceUrl: input.sourceUrl,
    trendScore: input.score ?? 82,
    confidence: 76,
    freshnessScore: 70,
    popularity: 65,
    quietness: 55,
    priceLevel: 2,
    sourceSignals: [
      {
        source: input.source ?? "database",
        label: `${input.source ?? "database"} 信号`,
        score: input.score ?? 82,
        evidence: "测试信号"
      }
    ],
    recallChannels: ["base"],
    textRelevance: 80,
    baseScore: 78,
    adjustedScore: input.score ?? 82,
    ranker: "weighted-v1",
    rankerVersion: "test",
    features: {
      candidateId: input.id,
      taste: 80,
      textRelevance: 80,
      socialTrend: 80,
      freshness: 70,
      distance: 70,
      traffic: 70,
      timeFit: 70,
      novelty: 50,
      actionability: 100,
      userAffinity: 50,
      feedbackPenalty: 0,
      exposurePenalty: 0
    },
    scoreBreakdown: {
      taste: 80,
      textRelevance: 80,
      socialTrend: 80,
      freshness: 70,
      distance: 70,
      traffic: 70,
      timeFit: 70,
      novelty: 50,
      actionability: 100,
      userAffinity: 50,
      feedbackPenalty: 0,
      exposurePenalty: 0
    },
    traffic: {
      estimatedDurationMinutes: 18,
      mode: "transit",
      provider: "estimated",
      congestion: "smooth"
    }
  };
}

const route: RecommendedRoute = {
  id: "route-1",
  title: "静安今晚延展线",
  summary: "上生咖啡 -> 胶囊画廊 / 18 分钟可达",
  totalScore: 88,
  scoreBreakdown: {
    taste: 86,
    textRelevance: 82,
    socialTrend: 84,
    freshness: 78,
    distance: 75,
    traffic: 80,
    timeFit: 83,
    novelty: 70,
    actionability: 100,
    userAffinity: 50,
    feedbackPenalty: 0,
    exposurePenalty: 0
  },
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
      source: "xiaohongshu",
      sourceUrl: "https://example.com/xhs/a"
    },
    {
      id: "event-b",
      name: "胶囊画廊",
      type: "event",
      address: "南京西路",
      tags: ["展览"],
      source: "shanghai-gov",
      sourceUrl: "https://example.com/gov/b"
    }
  ],
  reason: "本地 reason",
  tips: []
};

test("source context keeps the first ranked candidate for each source", () => {
  const sourceContext = buildSourceContextItems([
    trafficCandidate({
      id: "xhs-first",
      name: "小红书第一条",
      source: "xiaohongshu",
      sourceUrl: "https://example.com/xhs/1",
      score: 90
    }),
    trafficCandidate({
      id: "gov-first",
      name: "上海政务第一条",
      source: "shanghai-gov",
      score: 84
    }),
    trafficCandidate({
      id: "xhs-second",
      name: "小红书第二条",
      source: "xiaohongshu",
      score: 70
    })
  ]);

  assert.deepEqual(
    sourceContext.map((item) => `${item.source}:${item.id}:${item.name}`),
    ["xiaohongshu:xhs-first:小红书第一条", "shanghai-gov:gov-first:上海政务第一条"]
  );
});

test("llm explainer receives selected routes and source first results", async () => {
  const sourceContext = buildSourceContextItems([
    trafficCandidate({ id: "xhs-first", name: "小红书第一条", source: "xiaohongshu" }),
    trafficCandidate({ id: "gov-first", name: "上海政务第一条", source: "shanghai-gov" })
  ]);
  let capturedRequest: Parameters<RouteExplanationClient["explain"]>[0] | undefined;
  const client: RouteExplanationClient = {
    async explain(request) {
      capturedRequest = request;
      return {
        routes: [
          {
            routeId: "route-1",
            reason: "上生咖啡和胶囊画廊都贴合今晚的咖啡、展览偏好。",
            tips: ["先到上生咖啡，再按路况去胶囊画廊。"],
            citedPlaceIds: ["venue-a", "event-b"],
            citedSignalSources: ["xiaohongshu"]
          }
        ]
      };
    }
  };

  const [explained] = await explainRoutes([route], input, {
    client,
    sourceContext,
    timeoutMs: 1000
  });

  assert.equal(capturedRequest?.routes[0]?.id, "route-1");
  assert.deepEqual(
    capturedRequest?.sourceContext.map((item) => `${item.source}:${item.name}`),
    ["xiaohongshu:小红书第一条", "shanghai-gov:上海政务第一条"]
  );
  assert.equal(explained.reason, "上生咖啡和胶囊画廊都贴合今晚的咖啡、展览偏好。");
  assert.deepEqual(explained.tips, ["先到上生咖啡，再按路况去胶囊画廊。"]);
});

test("route explainer uses local copy when no llm client is configured", async () => {
  const [explained] = await explainRoutes([route], input);

  assert.ok(explained.reason.includes("上生咖啡"));
  assert.ok(explained.reason.includes("交通大约 18 分钟"));
  assert.ok(explained.tips.length > 0);
});

test("route explainer falls back to local copy when llm times out", async () => {
  const client: RouteExplanationClient = {
    async explain() {
      return new Promise(() => {});
    }
  };

  const [explained] = await explainRoutes([route], input, {
    client,
    timeoutMs: 5
  });

  assert.ok(explained.reason.includes("上生咖啡"));
  assert.ok(explained.reason.includes("交通大约 18 分钟"));
});

test("llm explainer falls back when output cites non-route source context", async () => {
  const client: RouteExplanationClient = {
    async explain() {
      return {
        routes: [
          {
            routeId: "route-1",
            reason: "可以临时加入不在路线里的榜首店。",
            tips: ["不在路线里的榜首店也值得顺路看。"],
            citedPlaceIds: ["context-only"],
            citedSignalSources: ["xiaohongshu"]
          }
        ]
      };
    }
  };

  const [explained] = await explainRoutes([route], input, {
    client,
    sourceContext: [
      {
        id: "context-only",
        source: "xiaohongshu",
        name: "不在路线里的榜首店",
        type: "venue",
        city: "上海",
        area: "静安",
        tags: ["咖啡"],
        trendScore: 92,
        confidence: 70
      }
    ],
    timeoutMs: 1000
  });

  assert.notEqual(explained.reason, "可以临时加入不在路线里的榜首店。");
  assert.ok(!explained.reason.includes("不在路线里的榜首店"));
  assert.ok(explained.reason.includes("上生咖啡"));
});
