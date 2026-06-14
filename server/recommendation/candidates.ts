import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { isDemoModeEnabled, MOCK_SOURCE_NAMES } from "@/server/config/demo-mode";
import {
  areaVariants,
  areasMatch,
  canonicalizeArea
} from "@/server/geo/area-normalizer";
import {
  assessCandidateQuality,
  routeEligibilityFromQuality
} from "@/server/recommendation/quality";
import {
  applySignalBackedContext,
  type CitySignalContextRow
} from "@/server/recommendation/signal-fusion";
import type {
  Candidate,
  RecallChannel,
  RecommendInput,
  SourceSignal
} from "@/server/recommendation/types";

type DbEvent = Awaited<ReturnType<typeof prisma.event.findMany>>[number];
type DbVenue = Awaited<ReturnType<typeof prisma.venue.findMany>>[number];
type EntityType = "event" | "venue";
type TextRecallRow = {
  id: string;
  entityType: EntityType;
  score: number;
};

const CANDIDATE_RECALL_LIMIT = 80;
const ACTIONABLE_SUPPLEMENT_LIMIT = 80;
const DIRECT_SIGNAL_ONLY_SOURCES = new Set(["xiaohongshu"]);

// pg_trgm similarity 阈值（TASK2-P0-004：从 0.03 提升到 0.08）。
// 0.03 会召回大量低相关噪声；0.08 仍是宽松阈值，但能过滤明显无关项。
const TEXT_RECALL_SIMILARITY_THRESHOLD = 0.08;

// 标记 social 召回通道的 trendScore 下限（TASK2-P0-004 常量化，便于后续调参）。
// 原为未命名 magic number 70。
const SOCIAL_CHANNEL_TREND_THRESHOLD = 70;

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function candidateSearchText(candidate: Candidate) {
  return [candidate.name, candidate.description, candidate.address, ...candidate.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesInput(candidate: Candidate, input: RecommendInput) {
  if (candidate.city !== input.city) {
    return false;
  }

  if (!matchesCandidateArea(candidate.area, input.area)) {
    return false;
  }

  if (input.interests.length === 0) {
    return true;
  }

  const searchable = candidateSearchText(candidate);

  return input.interests.some((interest) => searchable.includes(interest.toLowerCase()));
}

function isDirectRecommendationCandidate(candidate: Candidate) {
  return !candidate.source || !DIRECT_SIGNAL_ONLY_SOURCES.has(candidate.source);
}

function normalizedText(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function candidateDedupeKey(candidate: Candidate) {
  if (candidate.sourceUrl) {
    return `url:${normalizedText(candidate.sourceUrl)}`;
  }

  return [
    "place",
    candidate.type,
    normalizedText(candidate.city),
    normalizedText(canonicalizeArea(candidate.area)),
    normalizedText(candidate.name),
    normalizedText(candidate.address)
  ].join(":");
}

function matchesCandidateArea(candidateArea?: string | null, requestedArea?: string | null) {
  return areasMatch(candidateArea, requestedArea);
}

function areaWhere(area?: string): Prisma.StringNullableFilter | undefined {
  const variants = areaVariants(area);

  return variants.length > 0
    ? {
        in: variants
      }
    : undefined;
}

function mergeRecallChannels(existing: Candidate, incoming: Candidate) {
  return {
    ...existing,
    recallChannels: [
      ...new Set([...(existing.recallChannels ?? []), ...(incoming.recallChannels ?? [])])
    ],
    textRelevance: Math.max(existing.textRelevance ?? 0, incoming.textRelevance ?? 0)
  };
}

function dedupeCandidates(candidates: Candidate[]) {
  const map = new Map<string, Candidate>();

  for (const candidate of candidates) {
    const key = candidateDedupeKey(candidate);
    const existing = map.get(key);

    if (existing) {
      map.set(key, mergeRecallChannels(existing, candidate));
    } else {
      map.set(key, candidate);
    }
  }

  return [...map.values()];
}

function normalizedClusterText(value?: string) {
  return (value ?? "")
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function candidateClusterKey(candidate: Candidate) {
  const address = normalizedClusterText(candidate.address);

  if (address) {
    const streetNumber = address.match(/[\u4e00-\u9fa5]+(?:路|街|道|弄)\d+号/)?.[0];

    return streetNumber ?? address;
  }

  return normalizedClusterText(candidate.name);
}

function actionableClusterCount(candidates: Candidate[]) {
  return new Set(
    candidates
      .filter((candidate) => candidate.routeEligible)
      .map(candidateClusterKey)
      .filter(Boolean)
  ).size;
}

function sortByTrendAndRelevance(a: Candidate, b: Candidate) {
  return (
    b.trendScore - a.trendScore ||
    (b.textRelevance ?? 0) - (a.textRelevance ?? 0) ||
    b.confidence - a.confidence
  );
}

function selectCandidateRecallWindow(candidates: Candidate[], limit = CANDIDATE_RECALL_LIMIT) {
  const routeEligible = candidates
    .filter((candidate) => candidate.routeEligible)
    .sort(sortByTrendAndRelevance);
  const signalOnly = candidates
    .filter((candidate) => !candidate.routeEligible)
    .sort(sortByTrendAndRelevance);

  return [...routeEligible, ...signalOnly].slice(0, limit);
}

function sourceSignalsFor(input: {
  source?: string | null;
  trendScore: number;
  confidence: number;
  tags: string[];
}): SourceSignal[] {
  const source = input.source ?? "database";

  return [
    {
      source,
      label: `${source} 信号`,
      score: Math.round(input.trendScore),
      evidence: `${input.tags.slice(0, 3).join(" / ")}，置信度 ${Math.round(input.confidence)}`
    }
  ];
}

function withRecall(candidate: Candidate, channels: RecallChannel[], textRelevance?: number): Candidate {
  return {
    ...candidate,
    recallChannels: [...new Set([...(candidate.recallChannels ?? []), ...channels])],
    textRelevance: Math.max(candidate.textRelevance ?? 0, textRelevance ?? 0)
  };
}

function inferRecallChannels(candidate: Candidate, input: RecommendInput): RecallChannel[] {
  const channels = new Set<RecallChannel>(["base"]);
  const interestSet = new Set(input.interests.map((interest) => interest.toLowerCase()));
  const tagHit = candidate.tags.some((tag) => interestSet.has(tag.toLowerCase()));
  const text = candidateSearchText(candidate);
  const textHit = input.interests.some((interest) => text.includes(interest.toLowerCase()));

  if (tagHit) {
    channels.add("tag");
  }

  if (textHit) {
    channels.add("text");
  }

  if (candidate.trendScore >= SOCIAL_CHANNEL_TREND_THRESHOLD) {
    channels.add("social");
  }

  return [...channels];
}

function textScore(candidate: Candidate, input: RecommendInput) {
  if (input.interests.length === 0) {
    return 55;
  }

  const text = candidateSearchText(candidate);
  const hits = input.interests.filter((interest) => text.includes(interest.toLowerCase()));

  return Math.round((hits.length / input.interests.length) * 100);
}

function freshnessFromDate(date?: Date | null) {
  if (!date) {
    return 58;
  }

  const days = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);

  if (days <= 1) return 90;
  if (days <= 7) return 78;
  if (days <= 30) return 64;
  return 48;
}

function storedQuality(row: unknown) {
  const value = row as {
    qualityScore?: unknown;
    qualityFlags?: unknown;
  };

  return {
    qualityScore: typeof value.qualityScore === "number" ? value.qualityScore : undefined,
    qualityFlags: Array.isArray(value.qualityFlags)
      ? value.qualityFlags.filter((flag): flag is string => typeof flag === "string")
      : undefined
  };
}

function candidateQuality(input: {
  name: string;
  type: Candidate["type"];
  source?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags: string[];
  row: unknown;
}) {
  const fallback = assessCandidateQuality(input);
  const stored = storedQuality(input.row);
  const storedFlags = stored.qualityFlags ?? [];
  const fallbackBlocksRoute =
    fallback.qualityFlags.includes("generic_social") ||
    fallback.qualityFlags.includes("social_signal_only");
  const storedLooksDefault =
    stored.qualityScore === 50 && storedFlags.length === 0 && fallback.qualityScore !== 50;
  const qualityScore = fallbackBlocksRoute
    ? fallback.qualityScore
    : storedLooksDefault
      ? fallback.qualityScore
      : Math.max(stored.qualityScore ?? fallback.qualityScore, fallback.qualityScore);
  const qualityFlags = fallbackBlocksRoute
    ? fallback.qualityFlags
    : [...new Set([...storedFlags, ...fallback.qualityFlags])];

  return {
    qualityScore,
    qualityFlags,
    routeEligible: routeEligibilityFromQuality({
      qualityScore,
      qualityFlags,
      address: input.address,
      lat: input.lat,
      lng: input.lng
    })
  };
}

function eventToCandidate(event: DbEvent, venue?: DbVenue): Candidate {
  // When a damai (or other crawler) event is matched to a confirmed AMap Venue,
  // backfill the venue's lat/lng/address/area onto the candidate so it can pass
  // the routeEligible gate. The event row itself keeps its own (null) coords.
  const address = event.address ?? venue?.address ?? null;
  const lat = event.lat ?? venue?.lat ?? null;
  const lng = event.lng ?? venue?.lng ?? null;
  const quality = candidateQuality({
    name: event.title,
    type: "event",
    source: event.source,
    address,
    lat,
    lng,
    tags: event.tags,
    row: event
  });

  return {
    id: event.id,
    name: event.title,
    type: "event",
    description: event.description ?? undefined,
    city: event.city,
    area: canonicalizeArea(event.area ?? venue?.area),
    address: address ?? undefined,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    venueId: event.venueId ?? undefined,
    startsAt: event.startTime?.toISOString(),
    endsAt: event.endTime?.toISOString(),
    tags: event.tags,
    source: event.source ?? undefined,
    sourceUrl: event.sourceUrl ?? undefined,
    imageUrl: event.imageUrl ?? undefined,
    trendScore: event.trendScore,
    confidence: event.confidence,
    freshnessScore: freshnessFromDate(event.startTime ?? event.createdAt),
    popularity: Math.round(event.trendScore),
    quietness: event.tags.includes("安静") || event.tags.includes("solo") ? 82 : 48,
    priceLevel: 2,
    sourceSignals: sourceSignalsFor({
      source: event.source,
      trendScore: event.trendScore,
      confidence: event.confidence,
      tags: event.tags
    }),
    recallChannels: ["base"],
    ...quality,
    signalStrength: event.trendScore
  };
}

function venueToCandidate(venue: DbVenue): Candidate {
  const quality = candidateQuality({
    name: venue.name,
    type: "venue",
    source: venue.source,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    tags: venue.tags,
    row: venue
  });

  return {
    id: venue.id,
    name: venue.name,
    type: "venue",
    description: venue.description ?? undefined,
    city: venue.city,
    area: canonicalizeArea(venue.area),
    address: venue.address ?? undefined,
    lat: venue.lat ?? undefined,
    lng: venue.lng ?? undefined,
    tags: venue.tags,
    source: venue.source ?? undefined,
    sourceUrl: venue.sourceUrl ?? undefined,
    imageUrl: venue.imageUrl ?? undefined,
    trendScore: venue.trendScore,
    confidence: venue.confidence,
    freshnessScore: freshnessFromDate(venue.createdAt),
    popularity: venue.popularity ?? Math.round(venue.trendScore),
    quietness: venue.quietness ?? 50,
    priceLevel: venue.priceLevel ?? 2,
    sourceSignals: sourceSignalsFor({
      source: venue.source,
      trendScore: venue.trendScore,
      confidence: venue.confidence,
      tags: venue.tags
    }),
    recallChannels: ["base"],
    ...quality,
    signalStrength: venue.trendScore
  };
}

function eventWhere(input: RecommendInput): Prisma.EventWhereInput {
  const area = areaWhere(input.area);

  return {
    city: input.city,
    ...(area ? { area } : {}),
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

function venueWhere(input: RecommendInput): Prisma.VenueWhereInput {
  const area = areaWhere(input.area);

  return {
    city: input.city,
    ...(area ? { area } : {}),
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

function nonMockSourceSql() {
  return isDemoModeEnabled()
    ? Prisma.empty
    : Prisma.sql`AND ("source" IS NULL OR "source" NOT IN (${Prisma.join([...MOCK_SOURCE_NAMES])}))
                  AND ("sourceKey" IS NULL OR "sourceKey" NOT LIKE 'demo:%')`;
}

async function loadBaseCandidates(input: RecommendInput) {
  const [events, venues] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere(input),
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.venue.findMany({
      where: venueWhere(input),
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50
    })
  ]);

  // Backfill coordinates from matched AMap venues so damai events become
  // route-eligible. Only venues referenced by recalled events are loaded.
  const venueIds = new Set(events.map((event) => event.venueId).filter(Boolean) as string[]);
  const venueById = new Map<string, DbVenue>();
  if (venueIds.size > 0) {
    const matchedVenues = await prisma.venue.findMany({ where: { id: { in: [...venueIds] } } });
    for (const venue of matchedVenues) {
      venueById.set(venue.id, venue);
    }
  }

  return [
    ...events.map((event) => eventToCandidate(event, event.venueId ? venueById.get(event.venueId) : undefined)),
    ...venues.map(venueToCandidate)
  ]
    .filter((candidate) => matchesInput(candidate, input))
    .map((candidate) =>
      withRecall(candidate, inferRecallChannels(candidate, input), textScore(candidate, input))
    );
}

async function loadTextRecallRows(input: RecommendInput): Promise<TextRecallRow[]> {
  const query = input.interests.join(" ").trim();

  if (!query) {
    return [];
  }

  const variants = areaVariants(input.area);
  const areaClause = variants.length
    ? Prisma.sql`AND "area" IN (${Prisma.join(variants)})`
    : Prisma.empty;
  const sourceClause = nonMockSourceSql();

  try {
    const [eventRows, venueRows] = await Promise.all([
      prisma.$queryRaw<TextRecallRow[]>`
        SELECT
          "id",
          'event'::text AS "entityType",
          similarity(
            lower(concat_ws(' ', "title", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) * 100 AS "score"
        FROM "Event"
        WHERE "city" = ${input.city}
          ${areaClause}
          ${sourceClause}
          AND similarity(
            lower(concat_ws(' ', "title", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) > ${TEXT_RECALL_SIMILARITY_THRESHOLD}
        ORDER BY "score" DESC
        LIMIT 30
      `,
      prisma.$queryRaw<TextRecallRow[]>`
        SELECT
          "id",
          'venue'::text AS "entityType",
          similarity(
            lower(concat_ws(' ', "name", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) * 100 AS "score"
        FROM "Venue"
        WHERE "city" = ${input.city}
          ${areaClause}
          ${sourceClause}
          AND similarity(
            lower(concat_ws(' ', "name", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) > ${TEXT_RECALL_SIMILARITY_THRESHOLD}
        ORDER BY "score" DESC
        LIMIT 30
      `
    ]);

    return [...eventRows, ...venueRows];
  } catch {
    return [];
  }
}

async function loadTextRecallCandidates(input: RecommendInput): Promise<Candidate[]> {
  const rows = await loadTextRecallRows(input);
  const eventScores = new Map(
    rows.filter((row) => row.entityType === "event").map((row) => [row.id, row.score])
  );
  const venueScores = new Map(
    rows.filter((row) => row.entityType === "venue").map((row) => [row.id, row.score])
  );
  const [events, venues] = await Promise.all([
    eventScores.size > 0
      ? prisma.event.findMany({
          where: {
            id: {
              in: [...eventScores.keys()]
            }
          }
        })
      : [],
    venueScores.size > 0
      ? prisma.venue.findMany({
          where: {
            id: {
              in: [...venueScores.keys()]
            }
          }
        })
      : []
  ]);

  return [
    ...events.map((event) => withRecall(eventToCandidate(event), ["text"], eventScores.get(event.id))),
    ...venues.map((venue) => withRecall(venueToCandidate(venue), ["text"], venueScores.get(venue.id)))
  ];
}

async function loadCityFallbackCandidates(input: RecommendInput): Promise<Candidate[]> {
  if (!input.area) {
    return [];
  }

  const fallbackInput = {
    ...input,
    area: undefined
  };
  const [baseResult, textResult] = await Promise.allSettled([
    loadBaseCandidates(fallbackInput),
    loadTextRecallCandidates(fallbackInput)
  ]);
  const baseCandidates = baseResult.status === "fulfilled" ? baseResult.value : [];
  const textCandidates = textResult.status === "fulfilled" ? textResult.value : [];

  return dedupeCandidates([...baseCandidates, ...textCandidates]).map((candidate) =>
    withRecall(candidate, ["city-fallback"])
  );
}

async function loadActionableSupplementCandidates(input: RecommendInput): Promise<Candidate[]> {
  const area = areaWhere(input.area);
  const executablePlaceFilter = {
    qualityScore: {
      gte: 55
    },
    NOT: {
      qualityFlags: {
        has: "generic_social"
      }
    },
    OR: [
      {
        address: {
          not: null
        }
      },
      {
        AND: [
          {
            lat: {
              not: null
            }
          },
          {
            lng: {
              not: null
            }
          }
        ]
      }
    ]
  } satisfies Pick<Prisma.EventWhereInput, "qualityScore" | "NOT" | "OR">;

  const [events, venues] = await Promise.all([
    prisma.event.findMany({
      where: {
        city: input.city,
        ...(area ? { area } : {}),
        source: {
          in: ["shanghai-gov"]
        },
        ...executablePlaceFilter,
        ...(isDemoModeEnabled()
          ? {}
          : {
              NOT: [
                executablePlaceFilter.NOT,
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
      },
      orderBy: [{ qualityScore: "desc" }, { trendScore: "desc" }, { createdAt: "desc" }],
      take: ACTIONABLE_SUPPLEMENT_LIMIT
    }),
    prisma.venue.findMany({
      where: {
        city: input.city,
        ...(area ? { area } : {}),
        source: {
          in: ["amap-poi"]
        },
        qualityScore: {
          gte: 55
        },
        NOT: {
          qualityFlags: {
            has: "generic_social"
          }
        },
        OR: executablePlaceFilter.OR
      },
      orderBy: [{ qualityScore: "desc" }, { trendScore: "desc" }, { createdAt: "desc" }],
      take: ACTIONABLE_SUPPLEMENT_LIMIT
    })
  ]);
  const supplementInput = {
    ...input,
    area: input.area
  };

  return dedupeCandidates([
    ...events.map((event) => eventToCandidate(event)),
    ...venues.map(venueToCandidate)
  ])
    .filter((candidate) => matchesInput(candidate, supplementInput))
    .map((candidate) =>
      withRecall(candidate, ["city-fallback"], textScore(candidate, input))
    );
}

async function loadCitySignalRows(input: RecommendInput): Promise<CitySignalContextRow[]> {
  const area = areaWhere(input.area);

  try {
    const signals = await prisma.citySignal.findMany({
      where: {
        city: input.city,
        ...(area ? { area } : {}),
        ...(input.interests.length > 0
          ? {
              tag: {
                in: input.interests
              }
            }
          : {}),
        ...(isDemoModeEnabled()
          ? {}
          : {
              source: {
                notIn: [...MOCK_SOURCE_NAMES]
              }
            })
      },
      orderBy: {
        heatScore: "desc"
      },
      take: 80
    });

    const signalIds = signals.map((signal) => signal.id);
    const matches =
      signalIds.length > 0
        ? await prisma.citySignalPlaceMatch.findMany({
            where: {
              source: { in: ["xiaohongshu", "damai"] },
              status: "confirmed",
              citySignalId: {
                in: signalIds
              },
              venueId: {
                not: null
              }
            }
          })
        : [];
    const matchedVenueIdsBySignalId = new Map<string, string[]>();

    for (const match of matches) {
      if (!match.citySignalId || !match.venueId) {
        continue;
      }

      const existing = matchedVenueIdsBySignalId.get(match.citySignalId) ?? [];
      existing.push(match.venueId);
      matchedVenueIdsBySignalId.set(match.citySignalId, existing);
    }

    return signals.map((signal) => ({
      id: signal.id,
      city: signal.city,
      area: signal.area,
      tag: signal.tag,
      heatScore: signal.heatScore,
      source: signal.source,
      metadata: signal.metadata,
      matchedVenueIds: matchedVenueIdsBySignalId.get(signal.id) ?? []
    }));
  } catch {
    return [];
  }
}

export async function retrieveDatabaseCandidates(input: RecommendInput): Promise<Candidate[]> {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured");
  }

  const [baseResult, textResult, signalResult] = await Promise.allSettled([
    loadBaseCandidates(input),
    loadTextRecallCandidates(input),
    loadCitySignalRows(input)
  ]);
  const baseCandidates = baseResult.status === "fulfilled" ? baseResult.value : [];
  const textCandidates = textResult.status === "fulfilled" ? textResult.value : [];
  const citySignals = signalResult.status === "fulfilled" ? signalResult.value : [];
  let recalledCandidates = dedupeCandidates([...baseCandidates, ...textCandidates]).filter(
    isDirectRecommendationCandidate
  );

  if (actionableClusterCount(recalledCandidates) < 6) {
    const supplementInput = input.area
      ? {
          ...input,
          area: undefined
        }
      : input;

    recalledCandidates = dedupeCandidates([
      ...recalledCandidates,
      ...(await loadCityFallbackCandidates(input)),
      ...(await loadActionableSupplementCandidates(supplementInput))
    ]).filter(isDirectRecommendationCandidate);
  }

  const merged = applySignalBackedContext(
    recalledCandidates,
    citySignals,
    input
  );

  if (merged.length === 0 && baseResult.status === "rejected") {
    throw baseResult.reason;
  }

  return selectCandidateRecallWindow(merged);
}

export const __testing = {
  matchesCandidateArea,
  selectCandidateRecallWindow,
  candidateQuality
};
