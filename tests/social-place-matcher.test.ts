import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAmapSupplementSearchKeywords,
  buildSocialTrendForPlaceMatch,
  normalizePlaceMatchReview,
  rankAmapVenueCandidates,
  type AmapVenueMatchCandidate,
  type SocialTrendForPlaceMatch
} from "@/server/ingest/social-place-matcher";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const trend: SocialTrendForPlaceMatch = {
  source: "xiaohongshu",
  sourceKey: "xiaohongshu:note-1",
  title: "静安寺附近的眠羊咖啡新展太适合周末独处",
  content: "笔记提到眠羊咖啡和小型插画展，位置在愚园路附近。",
  city: "上海",
  area: "静安",
  tags: ["咖啡", "展览", "独处"],
  trendScore: 88,
  normalizedTitle: "眠羊咖啡插画展",
  normalizedAddress: "愚园路"
};

function venue(input: Partial<AmapVenueMatchCandidate> & Pick<AmapVenueMatchCandidate, "id" | "name">) {
  return {
    city: "上海",
    area: "静安",
    source: "amap-poi",
    address: "愚园路 300 号",
    lat: 31.224,
    lng: 121.459,
    tags: ["咖啡厅", "餐饮服务"],
    ...input
  } satisfies AmapVenueMatchCandidate;
}

test("algorithm screening ranks likely AMap venue candidates before loose tag matches", () => {
  const ranked = rankAmapVenueCandidates({
    trend,
    venues: [
      venue({
        id: "venue-sheep",
        name: "眠羊咖啡"
      }),
      venue({
        id: "venue-generic",
        name: "静安咖啡集合店",
        address: "南京西路 100 号"
      }),
      venue({
        id: "venue-other-city",
        name: "眠羊咖啡杭州店",
        city: "杭州"
      })
    ]
  });

  assert.equal(ranked[0].id, "venue-sheep");
  assert.ok(ranked[0].algorithmScore > ranked[1].algorithmScore);
  assert.deepEqual(
    ranked.map((candidate) => candidate.id),
    ["venue-sheep", "venue-generic"]
  );
  assert.ok(ranked[0].matchedFields.includes("name"));
});

test("LLM review cannot confirm venues outside algorithm Top-K", () => {
  const ranked = rankAmapVenueCandidates({
    trend,
    venues: [
      venue({
        id: "venue-sheep",
        name: "眠羊咖啡"
      })
    ]
  });

  const review = normalizePlaceMatchReview(
    {
      status: "confirmed",
      venueId: "venue-outside",
      confidence: 96,
      matchedFields: ["name"],
      reason: "模型试图选择候选外地点"
    },
    ranked
  );

  assert.equal(review.status, "ambiguous");
  assert.equal(review.venueId, undefined);
});

test("LLM low-confidence confirmations are downgraded to ambiguous", () => {
  const ranked = rankAmapVenueCandidates({
    trend,
    venues: [
      venue({
        id: "venue-sheep",
        name: "眠羊咖啡"
      })
    ]
  });

  const review = normalizePlaceMatchReview(
    {
      status: "confirmed",
      venueId: "venue-sheep",
      confidence: 52,
      matchedFields: ["tag"],
      reason: "只有主题相似"
    },
    ranked
  );

  assert.equal(review.status, "ambiguous");
  assert.equal(review.venueId, undefined);
});

test("generic Xiaohongshu listicles stay topic-only and do not trigger AMap supplement keywords", () => {
  const keywords = buildAmapSupplementSearchKeywords({
    ...trend,
    title: "上海7月33个活动合集，市集咖啡展览都帮你整理好了",
    normalizedTitle: "上海活动合集",
    tags: ["咖啡", "展览", "市集"]
  });
  const ranked = rankAmapVenueCandidates({
    trend: {
      ...trend,
      title: "上海7月33个活动合集，市集咖啡展览都帮你整理好了",
      normalizedTitle: "上海活动合集",
      tags: ["咖啡", "展览", "市集"]
    },
    venues: [
      venue({
        id: "venue-market",
        name: "静安嘉里中心"
      })
    ]
  });

  assert.deepEqual(keywords, []);
  assert.deepEqual(ranked, []);
});

// ---- Damai event → AMap Venue matching (mirrors xiaohongshu path) ----

function damaiItem(input: { sourceId: string; title: string; venue: string; area?: string }): RawSourceItemDetail {
  return {
    id: `damai-${input.sourceId}`,
    source: "damai",
    sourceId: input.sourceId,
    sourceUrl: `https://detail.damai.cn/item.htm?id=${input.sourceId}`,
    title: input.title,
    content: `类别：演唱会\n场馆线索：${input.venue}\n演出时间：2026.06.20 周六 19:00`,
    rawPayload: { venue: input.venue, projectid: input.sourceId },
    city: "上海",
    status: "new",
    itemType: "event",
    tags: ["大麦", "演出", "演唱会", "音乐"],
    trendScore: 78,
    confidence: 72,
    area: input.area
  };
}

test("buildSocialTrendForPlaceMatch extracts damai venueName from content and rawPayload", () => {
  const trend = buildSocialTrendForPlaceMatch({
    item: damaiItem({ sourceId: "1003", title: "2026大张伟演唱会-上海站", venue: "浦发银行东方体育中心" }),
    sourceKey: "damai:1003",
    normalizedEntity: null
  });

  assert.ok(trend);
  assert.equal(trend.source, "damai");
  assert.equal(trend.venueName, "浦发银行东方体育中心");
  assert.equal(trend.title, "2026大张伟演唱会-上海站");
});

test("damai venueName matches a same-name AMap venue in algorithm Top-K", () => {
  const trend = buildSocialTrendForPlaceMatch({
    item: damaiItem({ sourceId: "1003", title: "2026大张伟演唱会-上海站", venue: "浦发银行东方体育中心" }),
    sourceKey: "damai:1003",
    normalizedEntity: null
  });

  const ranked = rankAmapVenueCandidates({
    trend: trend!,
    venues: [
      venue({
        id: "venue-sports-center",
        name: "浦发银行东方体育中心",
        area: "浦东",
        address: "浦东新区耀体路701号"
      }),
      venue({
        id: "venue-unrelated",
        name: "梅赛德斯-奔驰文化中心",
        area: "浦东"
      })
    ]
  });

  assert.equal(ranked[0].id, "venue-sports-center");
  assert.ok(ranked[0].matchedFields.includes("name"));
});

test("damai venueName rejects loose partial names and non-performance POIs", () => {
  const trend = buildSocialTrendForPlaceMatch({
    item: damaiItem({
      sourceId: "1004",
      title: "step.jad依加《Nightstep夜奔·巡城礼》",
      venue: "上海保利大剧院-大剧场"
    }),
    sourceKey: "damai:1004",
    normalizedEntity: null
  });

  const ranked = rankAmapVenueCandidates({
    trend: trend!,
    venues: [
      venue({
        id: "venue-grand-theatre",
        name: "上海大剧院",
        area: "黄浦",
        address: "人民大道300号",
        tags: ["演出", "剧院"]
      }),
      venue({
        id: "venue-poly",
        name: "上海保利大剧院(白银路店)",
        area: "嘉定",
        address: "白银路159号",
        tags: ["剧院"]
      }),
      venue({
        id: "venue-poly-company",
        name: "上海保利大剧院管理有限公司",
        area: "嘉定",
        address: "白银路159号",
        tags: ["公司"]
      })
    ]
  });

  assert.equal(ranked[0]?.id, "venue-poly");
  assert.ok(!ranked.some((candidate) => candidate.id === "venue-grand-theatre"));
  assert.ok(!ranked.some((candidate) => candidate.id === "venue-poly-company"));
});

test("damai venueName is used as the primary AMap supplement search keyword", () => {
  const keywords = buildAmapSupplementSearchKeywords({
    source: "damai",
    sourceKey: "damai:1003",
    title: "2026大张伟演唱会-上海站",
    city: "上海",
    area: "浦东",
    venueName: "浦发银行东方体育中心",
    tags: ["大麦", "演出"]
  });

  assert.ok(keywords.includes("浦发银行东方体育中心"));
});

test("LLM confirm outside damai Top-K is downgraded to ambiguous", () => {
  const trend = buildSocialTrendForPlaceMatch({
    item: damaiItem({ sourceId: "1003", title: "2026大张伟演唱会-上海站", venue: "浦发银行东方体育中心" }),
    sourceKey: "damai:1003",
    normalizedEntity: null
  });
  const ranked = rankAmapVenueCandidates({
    trend: trend!,
    venues: [venue({ id: "venue-sports-center", name: "浦发银行东方体育中心" })]
  });

  const review = normalizePlaceMatchReview(
    {
      status: "confirmed",
      venueId: "venue-im-not-in-topk",
      confidence: 95,
      matchedFields: ["name"],
      reason: "模型编造"
    },
    ranked
  );

  assert.equal(review.status, "ambiguous");
  assert.equal(review.venueId, undefined);
});

test("LLM cannot confirm a damai candidate whose name conflicts with venueName", () => {
  const trend = buildSocialTrendForPlaceMatch({
    item: damaiItem({
      sourceId: "1004",
      title: "step.jad依加《Nightstep夜奔·巡城礼》",
      venue: "上海保利大剧院-大剧场"
    }),
    sourceKey: "damai:1004",
    normalizedEntity: null
  });
  const ranked = [
    {
      ...venue({
        id: "venue-grand-theatre",
        name: "上海大剧院",
        area: "黄浦",
        address: "人民大道300号"
      }),
      algorithmScore: 36,
      matchedFields: ["name", "source", "coords"]
    }
  ];

  const review = normalizePlaceMatchReview(
    {
      status: "confirmed",
      venueId: "venue-grand-theatre",
      confidence: 88,
      matchedFields: ["name"],
      reason: "模型误判为同一剧院"
    },
    ranked,
    trend!
  );

  assert.equal(review.status, "ambiguous");
  assert.equal(review.venueId, undefined);
});
