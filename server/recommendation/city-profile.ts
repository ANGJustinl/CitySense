import { prisma } from "@/server/db/prisma";
import { isDemoModeEnabled, MOCK_SOURCE_NAMES } from "@/server/config/demo-mode";
import type { PulseMetric } from "@/server/recommendation/city-pulse";
import type { RecommendResponse, RecommendedRoute } from "@/server/recommendation/types";

/**
 * City interest profile, derived from real 小红书 (xiaohongshu) signals.
 *
 * Everything returned here must be traceable to a real DB row. No fabrication:
 * if the xiaohongshu data is sparse or unmatched, the profile says so honestly.
 */

export type RepresentativeNote = {
  sourceKey: string;
  title: string;
  author?: string;
  likedCount?: number;
  area?: string;
  itemType: string;
  trendScore: number;
  sourceUrl?: string;
  imageUrl?: string;
  /** First ~300 chars of the xiaohongshu AI-search answer synthesis, if present. */
  answerExcerpt?: string;
};

export type SourceStats = {
  rawItemCount: number;
  citySignalCount: number;
  coveredAreas: number;
  latestCapturedAt?: string;
  matchStats: {
    confirmed: number;
    noCandidate: number;
    topicOnly: number;
    other: number;
  };
};

export type CityProfileResponse = {
  city: string;
  area?: string;
  topTags: PulseMetric[];
  areaDistribution: PulseMetric[];
  representativeNotes: RepresentativeNote[];
  sourceStats: SourceStats;
  generatedAt: string;
};

export type TraceKind = "recall" | "signal" | "filter" | "rank" | "compose" | "note";
export type TraceTone = "ok" | "drop" | "warn" | "info";

export type TraceEntry = {
  kind: TraceKind;
  tone: TraceTone;
  message: string;
  /** Where this fact came from — a field path or query, for auditability. */
  source: string;
};

export type RecommendationTrace = {
  entries: TraceEntry[];
  /** Honest summary line about xiaohongshu's actual contribution. */
  summary: string;
};

const XHS_SOURCE = "xiaohongshu";
const ANSWER_EXCERPT_LIMIT = 300;

function nonDemoSignalSourceFilter() {
  return isDemoModeEnabled()
    ? {}
    : { source: { notIn: [...MOCK_SOURCE_NAMES] } };
}

function nonDemoRawSourceFilter() {
  return isDemoModeEnabled()
    ? {}
    : {
        NOT: [
          { source: { in: [...MOCK_SOURCE_NAMES] } },
          { sourceKey: { startsWith: "demo:" } }
        ]
      };
}

function topMetrics(map: Map<string, number>, limit: number): PulseMetric[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value: Math.round(value) }));
}

function excerptAnswer(rawPayload: unknown): string | undefined {
  if (!rawPayload || typeof rawPayload !== "object") {
    return undefined;
  }

  const answer = (rawPayload as { answer?: unknown }).answer;
  if (typeof answer !== "string" || !answer.trim()) {
    return undefined;
  }

  const text = answer.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length > ANSWER_EXCERPT_LIMIT
    ? `${text.slice(0, ANSWER_EXCERPT_LIMIT)}…`
    : text || undefined;
}

function noteLikedCount(rawPayload: unknown): number | undefined {
  if (!rawPayload || typeof rawPayload !== "object") {
    return undefined;
  }

  const note = (rawPayload as { note?: unknown }).note;
  if (!note || typeof note !== "object") {
    return undefined;
  }

  const liked = (note as { likedCount?: unknown }).likedCount;
  if (typeof liked === "number") {
    return liked;
  }
  if (typeof liked === "string") {
    const parsed = Number(liked.replace(/[,，]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Aggregate the xiaohongshu-driven city interest profile.
 * Reads CitySignal + RawSourceItem + CitySignalPlaceMatch; never throws on
 * sparse data (returns empty arrays / zero counts).
 */
export async function getCityProfile(input: {
  city: string;
  area?: string;
}): Promise<CityProfileResponse> {
  const generatedAt = new Date().toISOString();
  const city = input.city;
  const areaWhere = input.area ? { area: input.area } : {};
  const signalSourceFilter = nonDemoSignalSourceFilter();
  const rawSourceFilter = nonDemoRawSourceFilter();

  const empty: CityProfileResponse = {
    city,
    area: input.area,
    topTags: [],
    areaDistribution: [],
    representativeNotes: [],
    sourceStats: {
      rawItemCount: 0,
      citySignalCount: 0,
      coveredAreas: 0,
      matchStats: { confirmed: 0, noCandidate: 0, topicOnly: 0, other: 0 }
    },
    generatedAt
  };

  try {
    const [signals, rawItems, rawItemCount, citySignalCount, matchStats] = await Promise.all([
      prisma.citySignal.findMany({
        where: { city, ...areaWhere, source: XHS_SOURCE, ...signalSourceFilter },
        orderBy: { heatScore: "desc" },
        take: 200
      }),
      prisma.rawSourceItem.findMany({
        where: { city, source: XHS_SOURCE, ...rawSourceFilter, ...areaWhere },
        orderBy: [{ lastSeenAt: "desc" }],
        take: 5
      }),
      prisma.rawSourceItem.count({
        where: { city, source: XHS_SOURCE, ...rawSourceFilter }
      }),
      prisma.citySignal.count({
        where: { city, ...areaWhere, source: XHS_SOURCE, ...signalSourceFilter }
      }),
      prisma.citySignalPlaceMatch.groupBy({
        by: ["status"],
        where: { source: XHS_SOURCE },
        _count: { status: true }
      })
    ]);

    // Tag × heatScore aggregation (sum heat per tag, since each item fans out to N tag rows).
    const tagHeat = new Map<string, number>();
    const areaCounts = new Map<string, number>();
    for (const signal of signals) {
      const tag = signal.tag?.trim();
      if (tag) {
        tagHeat.set(tag, (tagHeat.get(tag) ?? 0) + (signal.heatScore ?? 0));
      }
      const area = signal.area?.trim();
      if (area) {
        areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
      }
    }

    const representativeNotes: RepresentativeNote[] = rawItems.map((item) => {
      const parsed = (item.parsedPayload ?? item.rawPayload) as {
        trendScore?: number;
        imageUrl?: string;
        answer?: string;
        rawPayload?: { answer?: string };
      } | null;

      return {
        sourceKey: item.sourceKey,
        title: item.title,
        author: item.author ?? undefined,
        likedCount: noteLikedCount(item.rawPayload),
        area: item.area ?? undefined,
        itemType: item.itemType,
        trendScore: typeof parsed?.trendScore === "number" ? parsed.trendScore : 0,
        sourceUrl: item.sourceUrl ?? undefined,
        imageUrl: parsed?.imageUrl ?? undefined,
        answerExcerpt:
          excerptAnswer(item.rawPayload) ??
          (parsed?.rawPayload ? excerptAnswer(parsed.rawPayload) : undefined)
      };
    });

    const matchStatsMap = new Map<string, number>();
    for (const row of matchStats) {
      matchStatsMap.set(row.status, row._count.status);
    }

    return {
      city,
      area: input.area,
      topTags: topMetrics(tagHeat, 15),
      areaDistribution: topMetrics(areaCounts, 5),
      representativeNotes,
      sourceStats: {
        rawItemCount,
        citySignalCount,
        coveredAreas: areaCounts.size,
        latestCapturedAt: signals[0]?.capturedAt?.toISOString(),
        matchStats: {
          confirmed: matchStatsMap.get("confirmed") ?? 0,
          noCandidate: matchStatsMap.get("no_candidate") ?? 0,
          topicOnly: matchStatsMap.get("topic_only") ?? 0,
          other:
            (matchStatsMap.get("ambiguous") ?? 0) +
            (matchStatsMap.get("tool_error") ?? 0) +
            (matchStatsMap.get("not_configured") ?? 0)
        }
      },
      generatedAt
    };
  } catch {
    return empty;
  }
}

/**
 * Build an honest recommendation reasoning trace from a real RecommendResponse
 * plus a couple of supplementary counts. Each entry cites its data source.
 *
 * Does NOT modify the recommend pipeline — reads only its output + extra queries.
 */
export async function buildRecommendationTrace(input: {
  city: string;
  area?: string;
  recommendation: RecommendResponse;
}): Promise<RecommendationTrace> {
  const { recommendation: rec } = input;
  const entries: TraceEntry[] = [];
  const ts = () => new Date().toISOString().slice(11, 19);

  // 1. Recall
  entries.push({
    kind: "recall",
    tone: "ok",
    message: `[${ts()}] 召回 ${rec.meta.candidateCount} 个候选（events + venues）`,
    source: "recommendation.meta.candidateCount"
  });

  // 2. Xiaohongshu signal availability — query the true count (not the 80 cap).
  let xhsSignalCount = 0;
  let topXhsTag: PulseMetric | undefined;
  try {
    const signalSourceFilter = nonDemoSignalSourceFilter();
    const areaWhere = input.area ? { area: input.area } : {};
    const [count, topSignal] = await Promise.all([
      prisma.citySignal.count({
        where: { city: input.city, ...areaWhere, source: XHS_SOURCE, ...signalSourceFilter }
      }),
      prisma.citySignal.findFirst({
        where: { city: input.city, ...areaWhere, source: XHS_SOURCE, ...signalSourceFilter },
        orderBy: { heatScore: "desc" }
      })
    ]);
    xhsSignalCount = count;
    if (topSignal) {
      topXhsTag = { label: topSignal.tag, value: Math.round(topSignal.heatScore) };
    }
  } catch {
    // query failed — note it honestly
  }

  if (xhsSignalCount > 0) {
    entries.push({
      kind: "signal",
      tone: "ok",
      message: `[${ts()}] 信号 从小红书召回 ${input.area ?? "全城"} 信号 ${xhsSignalCount} 条${
        topXhsTag ? `，top tag: ${topXhsTag.label}(${topXhsTag.value})` : ""
      }`,
      source: "prisma.citySignal.count(source=xiaohongshu)"
    });
  } else {
    entries.push({
      kind: "signal",
      tone: "warn",
      message: `[${ts()}] 信号 该区域暂无小红书 CitySignal`,
      source: "prisma.citySignal.count(source=xiaohongshu) = 0"
    });
  }

  // 3. Match status — the honest "why xhs often doesn't contribute places".
  try {
    const matchStats = await prisma.citySignalPlaceMatch.groupBy({
      by: ["status"],
      where: { source: XHS_SOURCE },
      _count: { status: true }
    });
    const map = new Map<string, number>();
    for (const row of matchStats) {
      map.set(row.status, row._count.status);
    }
    const confirmed = map.get("confirmed") ?? 0;
    const topicOnly = map.get("topic_only") ?? 0;
    const noCandidate = map.get("no_candidate") ?? 0;

    if (confirmed === 0) {
      entries.push({
        kind: "filter",
        tone: confirmed === 0 ? "drop" : "ok",
        message: `[${ts()}] 筛选 小红书信号无已确认 venue 匹配（confirmed=0；topic_only=${topicOnly}，no_candidate=${noCandidate}），信号在 fusion 阶段被丢弃`,
        source: "prisma.citySignalPlaceMatch.groupBy(source=xiaohongshu)"
      });
    } else {
      entries.push({
        kind: "filter",
        tone: "ok",
        message: `[${ts()}] 筛选 ${confirmed} 条小红书信号已绑定确认 venue，可叠加城市热度`,
        source: "prisma.citySignalPlaceMatch(status=confirmed)"
      });
    }
  } catch {
    // skip
  }

  // 4. Per-route composition — place provenance + signal entries.
  for (const route of rec.routes) {
    const placeSources = route.places.map(
      (p) => `${p.name}(${p.source ?? "?"})`
    );
    entries.push({
      kind: "compose",
      tone: "info",
      message: `[${ts()}] 组装 ${route.title}: ${placeSources.join(" → ")}`,
      source: `route.places[].source (route.id=${route.id})`
    });

    const xhsSignals = route.sourceSignals.filter((s) => s.source === XHS_SOURCE);
    if (xhsSignals.length === 0) {
      entries.push({
        kind: "note",
        tone: "warn",
        message: `[${ts()}] 说明 ${route.title} 的 sourceSignals 无小红书条目（地点来源非小红书）`,
        source: `route.sourceSignals (route.id=${route.id})`
      });
    } else {
      for (const signal of xhsSignals) {
        entries.push({
          kind: "note",
          tone: "ok",
          message: `[${ts()}] 说明 ${route.title} 携带小红书信号 ${signal.label} score=${signal.score}${signal.evidence ? ` (${signal.evidence})` : ""}`,
          source: `route.sourceSignals[] (route.id=${route.id})`
        });
      }
    }
  }

  // 5. Recall channels summary
  const channels = rec.meta.recallChannels ?? [];
  entries.push({
    kind: "rank",
    tone: "info",
    message: `[${ts()}] 排序 召回通道: ${channels.join(", ") || "base"} | ranker: ${rec.meta.ranker ?? "?"}`,
    source: "recommendation.meta.recallChannels / ranker"
  });

  const xhsPlaceCount = rec.routes.reduce(
    (sum, route) => sum + route.places.filter((p) => p.source === XHS_SOURCE).length,
    0
  );

  const summary =
    xhsPlaceCount > 0
      ? `小红书直接贡献了 ${xhsPlaceCount} 个路线地点。`
      : `小红书当前通过城市热度间接影响排序；${xhsSignalCount} 条信号中无已确认 venue，未直接贡献路线地点。直接地点匹配需完成 social-place-matcher 的 venue 绑定。`;

  return { entries, summary };
}

/** Count xiaohongshu places that appear in any route (for the summary line). */
export function countXiaohongshuPlacesInRoutes(routes: RecommendedRoute[]): number {
  return routes.reduce(
    (sum, route) => sum + route.places.filter((p) => p.source === XHS_SOURCE).length,
    0
  );
}
