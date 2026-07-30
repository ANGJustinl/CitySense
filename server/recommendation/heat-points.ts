import { prisma } from "@/server/db/prisma";
import {
  isDemoModeEnabled,
  isDemoContent,
  MOCK_SOURCE_NAMES
} from "@/server/config/demo-mode";
import {
  areaVariants,
  areasMatch,
  canonicalizeArea
} from "@/server/geo/area-normalizer";
import { calculateTasteScore } from "@/server/recommendation/scoring";
import type { Budget, Mood } from "@/server/recommendation/types";
import {
  heatCategoryById,
  heatCategoryForTags,
  type HeatCategoryId
} from "@/shared/heat-categories";

export type HeatMode = "pulse" | "trend" | "quiet" | "match";

export type HeatPoint = {
  lng: number;
  lat: number;
  weight: number; // 0-100，归一化
  category: HeatCategoryId;
  categoryLabel: string;
  name?: string;
  source?: string;
};

export type HeatPointsInput = {
  city: string;
  area?: string;
  mode: HeatMode;
  interests?: string[];
  mood?: Mood;
  budget?: Budget;
};

export type HeatPointsResponse = {
  points: HeatPoint[];
  mode: HeatMode;
  pointCount: number;
  generatedAt: string;
};

const VENUE_LIMIT = 70;
const EVENT_LIMIT = 50;
const TOTAL_LIMIT = VENUE_LIMIT + EVENT_LIMIT;

type DbEvent = Awaited<ReturnType<typeof prisma.event.findMany>>[number];
type DbVenue = Awaited<ReturnType<typeof prisma.venue.findMany>>[number];

function hasFiniteCoords(lat: number | null, lng: number | null) {
  return (
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function entityWhere(city: string, area?: string) {
  const variants = areaVariants(area);

  return {
    city,
    ...(variants.length > 0 ? { area: { in: variants } } : {}),
    ...(isDemoModeEnabled()
      ? {}
      : {
          NOT: [
            {
              source: {
                in: [...MOCK_SOURCE_NAMES]
              }
            },
            {
              sourceKey: {
                startsWith: "demo:"
              }
            }
          ]
        })
  };
}

/**
 * Pulse / Trend / Quiet 模式按 venue/event 的自身字段算 weight；
 * 这三种只依赖数据库行，不需要前端输入，因此抽出为纯函数便于测试。
 */
function weightFromRow(
  row: { trendScore: number; qualityScore: number; quietness?: number | null },
  mode: HeatMode
): number | undefined {
  if (mode === "pulse") {
    return clamp(row.trendScore * 0.6 + row.qualityScore * 0.4);
  }

  if (mode === "trend") {
    return clamp(row.trendScore);
  }

  if (mode === "quiet") {
    if (row.quietness === null || row.quietness === undefined) {
      return undefined;
    }

    return clamp(row.quietness);
  }

  return undefined;
}

export type HeatRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  trendScore: number;
  qualityScore: number;
  quietness?: number | null;
  tags: string[];
  source?: string | null;
  sourceKey?: string | null;
  sourceUrl?: string | null;
  area?: string | null;
  address?: string | null;
  description?: string | null;
  priceLevel?: number | null;
  popularity?: number | null;
  confidence: number;
};

function venueToHeatRow(venue: DbVenue): HeatRow {
  return {
    id: venue.id,
    name: venue.name,
    lat: venue.lat ?? 0,
    lng: venue.lng ?? 0,
    trendScore: venue.trendScore,
    qualityScore: venue.qualityScore,
    quietness: venue.quietness,
    tags: venue.tags,
    source: venue.source,
    sourceKey: venue.sourceKey,
    sourceUrl: venue.sourceUrl,
    area: venue.area,
    address: venue.address,
    description: venue.description,
    priceLevel: venue.priceLevel,
    popularity: venue.popularity,
    confidence: venue.confidence
  };
}

function eventToHeatRow(event: DbEvent): HeatRow {
  return {
    id: event.id,
    name: event.title,
    lat: event.lat ?? 0,
    lng: event.lng ?? 0,
    trendScore: event.trendScore,
    qualityScore: event.qualityScore,
    tags: event.tags,
    source: event.source,
    sourceKey: event.sourceKey,
    sourceUrl: event.sourceUrl,
    area: event.area,
    address: event.address,
    description: event.description,
    confidence: event.confidence
  };
}

/**
 * 名称簇去重：同一地址/坐标簇内的同名地点（如连锁店多门店、同一活动+场馆 POI）
 * 只保留 trendScore 最高的一条，避免热力图在单一物理位置堆积重复点。
 */
function dedupeHeatRows(rows: HeatRow[]): HeatRow[] {
  const byKey = new Map<string, HeatRow>();

  for (const row of rows) {
    const key = dedupeKey(row);
    const existing = byKey.get(key);

    if (!existing || row.trendScore > existing.trendScore) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function dedupeKey(row: HeatRow) {
  if (row.sourceUrl) {
    return `url:${normalizeText(row.sourceUrl)}`;
  }

  const lat = row.lat.toFixed(4);
  const lng = row.lng.toFixed(4);
  const area = canonicalizeArea(row.area) ?? "";

  return `place:${normalizeText(row.name)}:${area}:${lat},${lng}`;
}

function rowToMatchWeight(
  row: HeatRow,
  input: { interests: string[]; mood: Mood; budget: Budget }
) {
  // 复用 ranker 的 taste 纯函数（无 IO）。priceLevel/popularity/quietness 缺失时给中性默认，
  // 保持与 createDefaultFeatures 相同的兜底口径。
  return calculateTasteScore(
    {
      id: row.id,
      name: row.name,
      type: "venue",
      description: row.description ?? undefined,
      city: "",
      tags: row.tags,
      priceLevel: row.priceLevel ?? 2,
      quietness: row.quietness ?? 50,
      popularity: row.popularity ?? 50,
      confidence: row.confidence,
      trendScore: row.trendScore,
      sourceSignals: [],
      freshnessScore: 50
    },
    {
      userId: undefined,
      city: "",
      interests: input.interests,
      mood: input.mood,
      budget: input.budget,
      timeWindow: "now"
    }
  );
}

function toHeatPoint(row: HeatRow, weight: number): HeatPoint {
  const category = heatCategoryForTags({
    tags: row.tags,
    source: row.source,
    quietness: row.quietness
  });

  return {
    lng: Number(row.lng.toFixed(6)),
    lat: Number(row.lat.toFixed(6)),
    weight,
    category,
    categoryLabel: heatCategoryById(category).label,
    name: row.name,
    source: row.source ?? undefined
  };
}

/**
 * 从合并去重后的行集计算热力点。按 mode 选择 weight 公式；
 * 缺失必要字段的点（如 quiet 模式无 quietness）被跳过。
 *
 * 空间聚合交给前端 HexagonLayer（蜂窝图）按米分箱完成，
 * 服务端只返回 POI 级带权点，保留原始地理精度。
 */
export function buildHeatPoints(
  rows: HeatRow[],
  input: HeatPointsInput
): HeatPoint[] {
  if (rows.length === 0) {
    return [];
  }

  const deduped = dedupeHeatRows(rows).slice(0, TOTAL_LIMIT);

  if (input.mode === "match") {
    const interests = input.interests ?? [];
    const mood = input.mood ?? "random";
    const budget = input.budget ?? "medium";

    // match 模式若没有 interests，退化为 pulse，避免所有点都返回中性 62 分。
    if (interests.length === 0) {
      return deduped
        .map((row) => toHeatPoint(row, weightFromRow(row, "pulse") ?? 0))
        .filter((point) => point.weight > 0);
    }

    return deduped
      .map((row) => toHeatPoint(row, rowToMatchWeight(row, { interests, mood, budget })))
      .filter((point) => point.weight > 0);
  }

  return deduped
    .map((row) => {
      const weight = weightFromRow(row, input.mode);

      return weight === undefined ? null : toHeatPoint(row, weight);
    })
    .filter((point): point is HeatPoint => point !== null && point.weight > 0);
}

export async function getHeatPoints(
  input: HeatPointsInput
): Promise<HeatPointsResponse> {
  const generatedAt = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    return {
      points: [],
      mode: input.mode,
      pointCount: 0,
      generatedAt
    };
  }

  try {
    const [events, venues] = await Promise.all([
      prisma.event.findMany({
        where: entityWhere(input.city, input.area),
        orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
        take: EVENT_LIMIT
      }),
      prisma.venue.findMany({
        where: entityWhere(input.city, input.area),
        orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
        take: VENUE_LIMIT
      })
    ]);

    const rows: HeatRow[] = [
      ...venues
        .filter((venue) => hasFiniteCoords(venue.lat, venue.lng))
        .map(venueToHeatRow),
      ...events
        .filter((event) => hasFiniteCoords(event.lat, event.lng))
        .map(eventToHeatRow)
    ];

    const points = buildHeatPoints(rows, input);

    return {
      points,
      mode: input.mode,
      pointCount: points.length,
      generatedAt
    };
  } catch {
    return {
      points: [],
      mode: input.mode,
      pointCount: 0,
      generatedAt
    };
  }
}

/**
 * 导出内部纯函数供测试使用。生产代码请用 getHeatPoints。
 */
export const __test__ = {
  weightFromRow,
  dedupeHeatRows,
  venueToHeatRow,
  eventToHeatRow,
  hasFiniteCoords,
  entityWhere,
  dedupeKey,
  buildHeatPoints,
  isDemoContent,
  areasMatch
};

