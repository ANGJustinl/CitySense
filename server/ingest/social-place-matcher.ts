import { Prisma, type CitySignal, type Venue } from "@prisma/client";
import { z } from "zod";
import {
  areaVariants,
  areasMatch,
  canonicalizeArea
} from "@/server/geo/area-normalizer";
import {
  toNormalizedEntityInput,
  type NormalizedEntityInput
} from "@/server/ingest/normalize";
import { createSourceKey } from "@/server/ingest/source-key";
import {
  createLlmClient,
  llmTimeoutMs,
  OpenAiCompatibleClient,
  withLlmTimeout
} from "@/server/ai/llm-client";
import { prisma } from "@/server/db/prisma";
import { assessCandidateQuality, isGenericSocialContent } from "@/server/recommendation/quality";
import { searchAmapPoiVenueItems } from "@/server/sources/adapters/amap-poi.adapter";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const XIAOHONGSHU_SOURCE = "xiaohongshu";
const DAMAI_SOURCE = "damai";
// Sources whose city signals require an algorithm Top-K + LLM review before
// they can bind to an AMap Venue. xiaohongshu trends are topic/listicle-prone;
// damai events carry a venueName clue but must still be confirmed against a
// real AMap POI before becoming route-eligible.
const MATCHABLE_EVENT_SOURCES = new Set([XIAOHONGSHU_SOURCE, DAMAI_SOURCE]);
// glm-4-flash is used for place-match review: it is a simple
// match/no-match selection task that does not need deep reasoning, and the
// flash variant is fast enough to avoid the serial-review timeout that
// glm-4.6's reasoning mode hits. Override via CITYSENSE_PLACE_MATCH_MODEL.
const DEFAULT_MODEL = "glm-4-flash";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TOP_K = 5;
const DEFAULT_SUPPLEMENT_KEYWORD_LIMIT = 3;
const DEFAULT_SUPPLEMENT_LIMIT_PER_KEYWORD = 3;
// Confidence floor for promoting an LLM review to "confirmed". 60 is used
// because venue-name matches are authoritative for damai events (the venueName
// comes from the ticketing platform) and the GLM flash reviewer is conservative
// — it reliably returns ~68 for clear name matches. A higher threshold would
// leave almost every real venue match stuck at "ambiguous".
const MIN_CONFIRMED_CONFIDENCE = 60;

type FetchLike = typeof fetch;

export type SocialPlaceMatchStatus =
  | "confirmed"
  | "rejected"
  | "ambiguous"
  | "topic_only"
  | "no_candidate"
  | "not_configured"
  | "tool_error";

export type SocialTrendForPlaceMatch = {
  source: string;
  sourceKey: string;
  rawSourceItemId?: string;
  title: string;
  content?: string;
  city: string;
  area?: string | null;
  address?: string | null;
  venueName?: string;
  tags: string[];
  trendScore?: number;
  sourceUrl?: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  normalizedAddress?: string | null;
};

export type AmapVenueMatchCandidate = {
  id: string;
  name: string;
  city: string;
  area?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags: string[];
  source?: string | null;
  sourceKey?: string | null;
  sourceUrl?: string | null;
  trendScore?: number;
  confidence?: number;
};

export type RankedAmapVenueCandidate = AmapVenueMatchCandidate & {
  algorithmScore: number;
  matchedFields: string[];
};

export type PlaceMatchReviewOutput = {
  status: "confirmed" | "rejected" | "ambiguous" | "topic_only";
  venueId?: string | null;
  confidence?: number | null;
  matchedFields?: string[] | null;
  reason?: string | null;
};

export type NormalizedPlaceMatchReview = {
  status: SocialPlaceMatchStatus;
  venueId?: string;
  llmConfidence?: number;
  matchedFields: string[];
  reason?: string;
};

export type PlaceMatchReviewerRequest = {
  trend: SocialTrendForPlaceMatch;
  candidates: RankedAmapVenueCandidate[];
};

export type PlaceMatchReviewerClient = {
  review(
    request: PlaceMatchReviewerRequest,
    signal?: AbortSignal
  ): Promise<PlaceMatchReviewOutput | null>;
};

type MatchXiaohongshuInput = {
  item: RawSourceItemDetail;
  sourceKey: string;
  rawSourceItemId: string;
  normalizedEntity: NormalizedEntityInput | null;
  citySignals: CitySignal[];
  client?: PlaceMatchReviewerClient;
  fetchFn?: FetchLike;
  topK?: number;
};

const reviewOutputSchema = z.object({
  status: z.enum(["confirmed", "rejected", "ambiguous", "topic_only"]),
  venueId: z.string().nullish(),
  confidence: z.number().nullish(),
  matchedFields: z.array(z.string()).nullish(),
  reason: z.string().nullish()
});

const PLACE_MATCH_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["confirmed", "rejected", "ambiguous", "topic_only"]
    },
    venueId: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
    matchedFields: {
      type: ["array", "null"],
      items: { type: "string" }
    },
    reason: { type: ["string", "null"] }
  },
  required: ["status", "venueId", "confidence", "matchedFields", "reason"]
};

const PLACE_MATCH_REVIEW_INSTRUCTIONS = [
  "你是 CitySense 的地点匹配审查层，只判断城市趋势或演出活动是否能绑定到候选高德 Venue。",
  "input.source 可能是 xiaohongshu（小红书趋势，多为合集/攻略，泛化时返回 topic_only）",
  "或 damai（大麦演出活动，场馆名 venueName 是强地点线索）。",
  "只能从 input.candidates 中选择 venueId；不能新增、改写或猜测候选以外的地点。",
  "只有标题、正文、地址、区域或明确地点名足以指向同一个线下地点时，才返回 confirmed。",
  "对 damai 演出，venueName 与候选 Venue 名称指向同一线下场馆时即可 confirmed；",
  "同名连锁店、区域不清、证据不足或多个候选都可能时返回 ambiguous。",
  "泛化合集、攻略、清单、区域趋势或只有主题标签的内容返回 topic_only 或 ambiguous。",
  "输出必须是符合 JSON schema 的 JSON，不要输出解释性正文。"
].join("\n");

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function trim(value?: string | null) {
  const text = value?.trim();

  return text || undefined;
}

function numberFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function textForTrend(trend: SocialTrendForPlaceMatch) {
  return [
    trend.title,
    trend.normalizedTitle,
    trend.content,
    trend.normalizedDescription,
    trend.address,
    trend.normalizedAddress,
    trend.venueName,
    trend.area,
    ...trend.tags
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function bigrams(value: string) {
  const normalized = normalizeText(value);

  if (normalized.length <= 1) {
    return normalized ? [normalized] : [];
  }

  return Array.from({ length: normalized.length - 1 }, (_, index) =>
    normalized.slice(index, index + 2)
  );
}

function textSimilarity(a?: string | null, b?: string | null) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) {
    return 0;
  }

  if (left.includes(right) || right.includes(left)) {
    return 100;
  }

  const leftSet = new Set(bigrams(left));
  const rightSet = new Set(bigrams(right));
  const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union > 0 ? (intersection / union) * 100 : 0;
}

function tagsOverlap(left: string[], right: string[]) {
  const rightText = right.map(normalizeText).join(" ");

  return left
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      const normalized = normalizeText(tag);

      return normalized && rightText.includes(normalized);
    });
}

function hasCoordinates(candidate: AmapVenueMatchCandidate) {
  return (
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng)
  );
}

function isNonPerformanceVenuePoi(name: string) {
  return /票务|售票处|售票点|票务中心|商场店$|购物广场|管理有限公司|演出经纪|火车站|地铁站|停车场|(?:站|机场)$/.test(
    name
  );
}

function normalizeVenueIdentity(value?: string | null) {
  return normalizeText(value)
    .replace(/(?:主剧场|大剧场|小剧场|中剧场|实验剧场|音乐厅|体育馆|剧场)$/g, "")
    .replace(/(?:白银路店|旗舰店|暂停营业)$/g, "");
}

function venueIdentityMatches(venueName?: string | null, candidateName?: string | null) {
  const left = normalizeVenueIdentity(venueName);
  const right = normalizeVenueIdentity(candidateName);

  if (!left || !right || left.length < 4 || right.length < 4) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}

function isTopicOnlyTrend(trend: SocialTrendForPlaceMatch) {
  return isGenericSocialContent({
    source: trend.source,
    title: [trend.title, trend.normalizedTitle, trend.content].filter(Boolean).join(" "),
    tags: trend.tags
  });
}

function venueToMatchCandidate(venue: Venue): AmapVenueMatchCandidate {
  return {
    id: venue.id,
    name: venue.name,
    city: venue.city,
    area: venue.area,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    tags: venue.tags,
    source: venue.source,
    sourceKey: venue.sourceKey,
    sourceUrl: venue.sourceUrl,
    trendScore: venue.trendScore,
    confidence: venue.confidence
  };
}

export function rankAmapVenueCandidates(input: {
  trend: SocialTrendForPlaceMatch;
  venues: AmapVenueMatchCandidate[];
  topK?: number;
}) {
  if (isTopicOnlyTrend(input.trend)) {
    return [];
  }

  const trendText = textForTrend(input.trend);
  const venueName = input.trend.venueName?.trim();
  const normalizedVenueName = venueName ? normalizeText(venueName) : "";
  const isDamaiVenueMatch = input.trend.source === DAMAI_SOURCE && Boolean(venueName);
  const ranked = input.venues
    .filter((venue) => venue.city === input.trend.city && venue.source === "amap-poi")
    .filter((venue) => !(isDamaiVenueMatch && isNonPerformanceVenuePoi(venue.name)))
    .map((venue) => {
      const matchedFields = new Set<string>();
      let score = 0;

      if (areasMatch(input.trend.area, venue.area)) {
        score += 20;
        matchedFields.add("area");
      }

      // For damai events, venueName is the authoritative place clue. A direct
      // name match (equality or containment) is a much stronger signal than the
      // bigram overlap used for social trends, so it gets a dedicated boost that
      // dominates loose token overlaps (e.g. "上海站" matching anything starting
      // with "上海"). Ticket-office / sales-counter POIs that merely share the
      // venue name as a prefix are explicitly excluded — they are not the stage.
      const venueNameCompatible = venueIdentityMatches(venueName, venue.name);
      const normalizedName = normalizeText(venue.name);
      let venueNameExact = false;
      if (normalizedVenueName && normalizedName) {
        if (normalizedName === normalizedVenueName) {
          score += 45;
          venueNameExact = true;
          matchedFields.add("name");
        } else if (isDamaiVenueMatch && venueNameCompatible) {
          score += 40;
          matchedFields.add("name");
        } else if (normalizedName.includes(normalizedVenueName) || normalizedVenueName.includes(normalizedName)) {
          // Containment: e.g. venueName "梅赛德斯-奔驰文化中心" vs name
          // "梅赛德斯-奔驰文化中心购物广场" — still a strong match.
          if (!isDamaiVenueMatch) {
            score += 30;
            matchedFields.add("name");
          }
        }
      }

      const nameScore = Math.max(
        textSimilarity(trendText, venue.name),
        venueName ? textSimilarity(venueName, venue.name) : 0
      );
      const canUseLooseNameScore = !isDamaiVenueMatch || venueNameCompatible;
      if (!venueNameExact && canUseLooseNameScore && nameScore >= 18) {
        score += Math.min(38, nameScore * 0.38);
        matchedFields.add("name");
      }

      const address = input.trend.normalizedAddress ?? input.trend.address;
      const addressScore = Math.max(
        textSimilarity(address, venue.address),
        textSimilarity(trendText, venue.address)
      );
      if (addressScore >= 20) {
        score += Math.min(22, addressScore * 0.22);
        matchedFields.add("address");
      }

      const overlappedTags = tagsOverlap(input.trend.tags, venue.tags);
      if (overlappedTags.length > 0) {
        score += Math.min(20, overlappedTags.length * 8);
        matchedFields.add("tag");
      }

      // Penalize non-venue POIs (ticket offices, train / metro stations,
      // parking, mall shops) that share tokens with the show venue name. These
      // are not performance venues. "上海站" (Shanghai Railway Station) is a
      // common false positive because "上海" overlaps with many venue names.
      if (isNonPerformanceVenuePoi(venue.name)) {
        score -= 30;
      }

      if (venue.source === "amap-poi") {
        score += 10;
        matchedFields.add("source");
      }

      if (hasCoordinates(venue)) {
        score += 5;
        matchedFields.add("coords");
      }

      return {
        ...venue,
        algorithmScore: Math.round(score),
        matchedFields: [...matchedFields]
      };
    })
    .filter(
      (venue) =>
        venue.algorithmScore >= 28 &&
        (!isDamaiVenueMatch || venue.matchedFields.includes("name"))
    )
    .sort((a, b) => b.algorithmScore - a.algorithmScore || b.name.length - a.name.length);

  return ranked.slice(0, input.topK ?? DEFAULT_TOP_K);
}

export function normalizePlaceMatchReview(
  output: PlaceMatchReviewOutput | null,
  candidates: RankedAmapVenueCandidate[],
  trend?: SocialTrendForPlaceMatch
): NormalizedPlaceMatchReview {
  if (!output) {
    return {
      status: "ambiguous",
      matchedFields: [],
      reason: "LLM returned an empty place match review"
    };
  }

  const parsed = reviewOutputSchema.parse(output);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const confidence = clamp(parsed.confidence, 0, 100, 0);
  const matchedFields = [
    ...new Set(
      (parsed.matchedFields ?? [])
        .filter((field): field is string => typeof field === "string")
        .map((field) => field.trim())
        .filter(Boolean)
    )
  ].slice(0, 8);
  const reason = trim(parsed.reason);

  if (parsed.status !== "confirmed") {
    return {
      status: parsed.status,
      llmConfidence: confidence,
      matchedFields,
      reason
    };
  }

  const venueId = trim(parsed.venueId);

  if (!venueId || !candidateIds.has(venueId)) {
    return {
      status: "ambiguous",
      llmConfidence: confidence,
      matchedFields,
      reason: reason ?? "LLM selected a venue outside the algorithm Top-K candidates"
    };
  }

  if (confidence < MIN_CONFIRMED_CONFIDENCE) {
    return {
      status: "ambiguous",
      llmConfidence: confidence,
      matchedFields,
      reason: reason ?? "LLM confidence is below the confirmed match threshold"
    };
  }

  const candidate = candidates.find((item) => item.id === venueId);
  if (
    trend?.source === DAMAI_SOURCE &&
    trend.venueName &&
    (!candidate ||
      isNonPerformanceVenuePoi(candidate.name) ||
      !venueIdentityMatches(trend.venueName, candidate.name))
  ) {
    return {
      status: "ambiguous",
      llmConfidence: confidence,
      matchedFields,
      reason: reason ?? "LLM selected a venue that does not match the Damai venueName"
    };
  }

  return {
    status: "confirmed",
    venueId,
    llmConfidence: confidence,
    matchedFields,
    reason
  };
}

function createDefaultReviewerClient(fetchFn: FetchLike): PlaceMatchReviewerClient | undefined {
  const shared = createLlmClient({
    modelEnv: "CITYSENSE_PLACE_MATCH_MODEL",
    defaultModel: DEFAULT_MODEL,
    fetchFn
  });
  return shared ? adaptSharedReviewerClient(shared) : undefined;
}

/** Adapts the shared OpenAI-compatible client to the reviewer interface. */
function adaptSharedReviewerClient(client: OpenAiCompatibleClient): PlaceMatchReviewerClient {
  return {
    async review(request, signal) {
      const text = await client.completeJsonOrNull({
        instructions: PLACE_MATCH_REVIEW_INSTRUCTIONS,
        schema: PLACE_MATCH_REVIEW_SCHEMA,
        userPayload: request,
        maxTokens: 800,
        signal
      });
      return text ? reviewOutputSchema.parse(JSON.parse(text)) : null;
    }
  };
}

function cleanVenueName(value: string): string {
  // Some Damai rawPayload.venue fields are contaminated with show metadata
  // (e.g. "梅赛德斯-奔驰文化中心。演出时间：2026.06.20..."). The venue name
  // ends at the first sentence break followed by non-name content. Trim at the
  // first 。 ; or newline that is followed by 演出/票价/状态/简介/艺人 etc.
  const cut = value.split(/[。；;]\s*/)[0]?.trim();
  return cut && cut.length >= 2 ? cut : value.trim();
}

function venueNameFromItem(item: RawSourceItemDetail): string | undefined {
  // 1. Explicit rawPayload.venue / venueName (damai adapter always sets this).
  const raw = item.rawPayload as { venue?: unknown; venueName?: unknown } | undefined;
  const fromPayload = trim(cleanVenueName(stripHtml(raw?.venue) ?? stripHtml(raw?.venueName)));
  if (fromPayload) {
    return fromPayload;
  }

  // 2. "场馆线索：xxx" line inside the synthesized content.
  const content = item.content ?? "";
  const match = /场馆线索[：:]\s*([^\n]+)/.exec(content);

  return trim(cleanVenueName(match?.[1] ?? ""));
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSocialTrendForPlaceMatch(input: {
  item: RawSourceItemDetail;
  sourceKey: string;
  rawSourceItemId?: string;
  normalizedEntity: NormalizedEntityInput | null;
}): SocialTrendForPlaceMatch | null {
  const city = trim(input.normalizedEntity?.city) ?? trim(input.item.city);
  const title = trim(input.item.title);

  if (!city || !title) {
    return null;
  }

  const venueName = input.item.source === DAMAI_SOURCE ? venueNameFromItem(input.item) : undefined;

  return {
    source: input.item.source,
    sourceKey: input.sourceKey,
    rawSourceItemId: input.rawSourceItemId,
    title,
    content: trim(input.item.content),
    city,
    area: canonicalizeArea(input.normalizedEntity?.area ?? input.item.area),
    address: trim(input.item.address),
    venueName,
    tags: input.normalizedEntity?.tags.length ? input.normalizedEntity.tags : input.item.tags,
    trendScore: input.normalizedEntity?.trendScore ?? input.item.trendScore,
    sourceUrl: input.item.sourceUrl,
    normalizedTitle: input.normalizedEntity?.title,
    normalizedDescription: input.normalizedEntity?.description,
    normalizedAddress: input.normalizedEntity?.address
  };
}

function cleanSearchKeyword(value?: string | null) {
  const text = trim(value)
    ?.replace(/小红书|攻略|合集|清单|收藏|路线|附近|最新|打卡|推荐/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text && text.length >= 2 ? text : undefined;
}

export function buildAmapSupplementSearchKeywords(trend: SocialTrendForPlaceMatch) {
  if (isTopicOnlyTrend(trend)) {
    return [];
  }

  const area = canonicalizeArea(trend.area);
  // For damai events, venueName is the authoritative place clue. The event
  // title is the show name (e.g. "NIKI SUMMERTIME 2026 上海站") and MUST NOT be
  // used as an AMap POI keyword — titles often end in "上海站" (meaning the
  // Shanghai stop of a tour), which would match the railway station POI.
  const titleKeywords =
    trend.source === DAMAI_SOURCE && trend.venueName
      ? []
      : [cleanSearchKeyword(trend.normalizedTitle), cleanSearchKeyword(trend.title)];

  const candidates = [
    cleanSearchKeyword(trend.venueName),
    cleanSearchKeyword(trend.normalizedAddress),
    cleanSearchKeyword(trend.address),
    ...titleKeywords,
    ...trend.tags.map(cleanSearchKeyword)
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value) => value !== trend.city && value !== area)
    // Reject generic transport / hub keywords that produce false POI matches.
    .filter((value) => !/^(?:上海站|火车站|机场|地铁站)$/.test(value));

  return [...new Set(candidates)].slice(
    0,
    numberFromEnv("CITYSENSE_XHS_AMAP_SUPPLEMENT_KEYWORD_LIMIT", DEFAULT_SUPPLEMENT_KEYWORD_LIMIT)
  );
}

async function loadExistingAmapVenues(trend: SocialTrendForPlaceMatch) {
  const variants = areaVariants(trend.area);

  return prisma.venue.findMany({
    where: {
      city: trend.city,
      source: "amap-poi",
      ...(variants.length > 0
        ? {
            OR: [
              {
                area: {
                  in: variants
                }
              },
              {
                area: null
              }
            ]
          }
        : {})
    },
    orderBy: [{ qualityScore: "desc" }, { trendScore: "desc" }, { createdAt: "desc" }],
    take: 80
  });
}

async function upsertAmapVenueItem(item: RawSourceItemDetail) {
  const sourceKey = createSourceKey(item);
  const entity = toNormalizedEntityInput(item, sourceKey);

  if (!entity || entity.entityType !== "venue") {
    return null;
  }

  const quality = assessCandidateQuality({
    name: entity.title,
    type: "venue",
    source: entity.source,
    address: entity.address,
    lat: entity.lat,
    lng: entity.lng,
    tags: entity.tags
  });
  const values = {
    name: entity.title,
    description: entity.description ?? null,
    city: entity.city,
    area: entity.area ?? null,
    address: entity.address ?? null,
    lat: entity.lat ?? null,
    lng: entity.lng ?? null,
    tags: entity.tags,
    priceLevel: entity.priceLevel ?? null,
    quietness: entity.quietness ?? null,
    popularity: entity.popularity ?? null,
    source: entity.source,
    sourceUrl: entity.sourceUrl ?? null,
    imageUrl: entity.imageUrl ?? null,
    imageSource: entity.imageUrl ? entity.source : null,
    trendScore: entity.trendScore,
    confidence: entity.confidence,
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags
  };

  return prisma.venue.upsert({
    where: {
      sourceKey
    },
    create: {
      sourceKey,
      ...values
    },
    update: values
  });
}

async function supplementAmapVenues(input: {
  trend: SocialTrendForPlaceMatch;
  fetchFn?: FetchLike;
}) {
  if (!process.env.AMAP_API_KEY) {
    return [];
  }

  const keywords = buildAmapSupplementSearchKeywords(input.trend);

  if (keywords.length === 0) {
    return [];
  }

  const items = await searchAmapPoiVenueItems({
    city: input.trend.city,
    area: input.trend.area ?? undefined,
    keywords,
    fetchFn: input.fetchFn,
    limitPerKeyword: numberFromEnv(
      "CITYSENSE_XHS_AMAP_SUPPLEMENT_LIMIT_PER_KEYWORD",
      DEFAULT_SUPPLEMENT_LIMIT_PER_KEYWORD
    )
  });
  const venues: Venue[] = [];

  for (const item of items) {
    const venue = await upsertAmapVenueItem(item);

    if (venue) {
      venues.push(venue);
    }
  }

  return venues;
}

function matchMetadata(input: {
  trend: SocialTrendForPlaceMatch;
  ranked: RankedAmapVenueCandidate[];
  review?: NormalizedPlaceMatchReview;
}) {
  return {
    sourceKey: input.trend.sourceKey,
    sourceUrl: input.trend.sourceUrl,
    title: input.trend.title,
    normalizedTitle: input.trend.normalizedTitle,
    candidates: input.ranked.map((candidate) => ({
      venueId: candidate.id,
      name: candidate.name,
      area: candidate.area,
      address: candidate.address,
      algorithmScore: candidate.algorithmScore,
      matchedFields: candidate.matchedFields
    })),
    review: input.review
  };
}

async function replaceSignalMatches(input: {
  trend: SocialTrendForPlaceMatch;
  signals: CitySignal[];
  status: SocialPlaceMatchStatus;
  ranked: RankedAmapVenueCandidate[];
  review?: NormalizedPlaceMatchReview;
  reason?: string;
}) {
  const signalIds = input.signals.map((signal) => signal.id);
  const source = input.trend.source;

  if (signalIds.length === 0) {
    return;
  }

  await prisma.citySignalPlaceMatch.deleteMany({
    where: {
      source,
      citySignalId: {
        in: signalIds
      }
    }
  });

  const reviewedAt = new Date();
  const topCandidate = input.review?.venueId
    ? input.ranked.find((candidate) => candidate.id === input.review?.venueId)
    : input.ranked[0];

  await prisma.citySignalPlaceMatch.createMany({
    data: input.signals.map((signal) => ({
      source,
      rawSourceItemId: input.trend.rawSourceItemId,
      citySignalId: signal.id,
      venueId: input.review?.status === "confirmed" ? input.review.venueId : null,
      status: input.status,
      algorithmScore: topCandidate?.algorithmScore ?? 0,
      llmConfidence: input.review?.llmConfidence ?? null,
      matchedFields: input.review?.matchedFields.length
        ? input.review.matchedFields
        : topCandidate?.matchedFields ?? [],
      reason: input.review?.reason ?? input.reason ?? null,
      metadata: toJson(
        matchMetadata({
          trend: input.trend,
          ranked: input.ranked,
          review: input.review
        })
      ),
      reviewedAt
    }))
  });

  // For damai events, persist the confirmed AMap venue link on the Event row so
  // the recall layer can backfill lat/lng/address and make it route-eligible.
  if (source === DAMAI_SOURCE && input.review?.status === "confirmed" && input.review.venueId) {
    await prisma.event
      .updateMany({
        where: { sourceKey: input.trend.sourceKey },
        data: { venueId: input.review.venueId }
      })
      .catch(() => undefined);
  } else if (source === DAMAI_SOURCE) {
    await prisma.event
      .updateMany({
        where: { sourceKey: input.trend.sourceKey },
        data: { venueId: null }
      })
      .catch(() => undefined);
  }
}

export async function matchXiaohongshuSignalsToAmapVenues(input: MatchXiaohongshuInput) {
  if (!MATCHABLE_EVENT_SOURCES.has(input.item.source) || input.citySignals.length === 0) {
    return;
  }

  const trend = buildSocialTrendForPlaceMatch({
    item: input.item,
    sourceKey: input.sourceKey,
    rawSourceItemId: input.rawSourceItemId,
    normalizedEntity: input.normalizedEntity
  });

  if (!trend) {
    return;
  }

  if (isTopicOnlyTrend(trend)) {
    await replaceSignalMatches({
      trend,
      signals: input.citySignals,
      status: "topic_only",
      ranked: [],
      reason:
        input.item.source === DAMAI_SOURCE
          ? "Damai event has no resolvable venue clue and cannot bind to an AMap venue"
          : "Generic Xiaohongshu trend is topic-only and cannot bind to one AMap venue"
    });
    return;
  }

  let ranked: RankedAmapVenueCandidate[] = [];

  try {
    const existing = await loadExistingAmapVenues(trend);
    ranked = rankAmapVenueCandidates({
      trend,
      venues: existing.map(venueToMatchCandidate),
      topK: input.topK ?? DEFAULT_TOP_K
    });

    // For damai events, venueName is the authoritative place clue. If the
    // existing pool did not yield a strong name match (top candidate matched on
    // name), supplement with an AMap POI search keyed on the venueName so the
    // real venue enters the candidate set before LLM review. Without this, a
    // weak token overlap (e.g. "上海站" for a show at "MODERN SKY LAB上海")
    // would lock in a wrong match.
    const needsVenueNameSupplement =
      Boolean(trend.venueName) &&
      (ranked.length === 0 || !ranked[0]?.matchedFields.includes("name"));

    if (ranked.length === 0 || needsVenueNameSupplement) {
      const supplemented = await supplementAmapVenues({
        trend,
        fetchFn: input.fetchFn
      });

      ranked = rankAmapVenueCandidates({
        trend,
        venues: [...existing, ...supplemented].map(venueToMatchCandidate),
        topK: input.topK ?? DEFAULT_TOP_K
      });
    }

    if (ranked.length === 0) {
      await replaceSignalMatches({
        trend,
        signals: input.citySignals,
        status: process.env.AMAP_API_KEY ? "no_candidate" : "not_configured",
        ranked: [],
        reason: process.env.AMAP_API_KEY
          ? "No AMap POI candidate survived algorithm screening"
          : "AMAP_API_KEY is not configured for ingest-time POI supplementation"
      });
      return;
    }

    const client = input.client ?? createDefaultReviewerClient(input.fetchFn ?? fetch);

    if (!client) {
      await replaceSignalMatches({
        trend,
        signals: input.citySignals,
        status: "not_configured",
        ranked,
        reason: "OPENAI_API_KEY is not configured for place match review"
      });
      return;
    }

    const reviewRequest = { trend, candidates: ranked };
    const output = await withLlmTimeout({
      timeoutMs: llmTimeoutMs("CITYSENSE_PLACE_MATCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      task: (signal) => client.review(reviewRequest, signal)
    });
    const review = normalizePlaceMatchReview(output, ranked, trend);

    await replaceSignalMatches({
      trend,
      signals: input.citySignals,
      status: review.status,
      ranked,
      review
    });
  } catch (error) {
    await replaceSignalMatches({
      trend,
      signals: input.citySignals,
      status: "tool_error",
      ranked,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

export const __testing = {
  isTopicOnlyTrend,
  textSimilarity
};
