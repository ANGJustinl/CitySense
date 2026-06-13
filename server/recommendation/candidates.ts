import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
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

  if (input.area && candidate.area !== input.area) {
    return false;
  }

  if (input.interests.length === 0) {
    return true;
  }

  const searchable = candidateSearchText(candidate);

  return input.interests.some((interest) => searchable.includes(interest.toLowerCase()));
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
    normalizedText(candidate.area),
    normalizedText(candidate.name),
    normalizedText(candidate.address)
  ].join(":");
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

  if (candidate.trendScore >= 70) {
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

function eventToCandidate(event: DbEvent): Candidate {
  return {
    id: event.id,
    name: event.title,
    type: "event",
    description: event.description ?? undefined,
    city: event.city,
    area: event.area ?? undefined,
    address: event.address ?? undefined,
    lat: event.lat ?? undefined,
    lng: event.lng ?? undefined,
    startsAt: event.startTime?.toISOString(),
    endsAt: event.endTime?.toISOString(),
    tags: event.tags,
    source: event.source ?? undefined,
    sourceUrl: event.sourceUrl ?? undefined,
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
    recallChannels: ["base"]
  };
}

function venueToCandidate(venue: DbVenue): Candidate {
  return {
    id: venue.id,
    name: venue.name,
    type: "venue",
    description: venue.description ?? undefined,
    city: venue.city,
    area: venue.area ?? undefined,
    address: venue.address ?? undefined,
    lat: venue.lat ?? undefined,
    lng: venue.lng ?? undefined,
    tags: venue.tags,
    source: venue.source ?? undefined,
    sourceUrl: venue.sourceUrl ?? undefined,
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
    recallChannels: ["base"]
  };
}

function candidateWhere(input: RecommendInput) {
  const where = {
    city: input.city,
    ...(input.area ? { area: input.area } : {})
  };

  return where;
}

async function loadBaseCandidates(input: RecommendInput) {
  const where = candidateWhere(input);
  const [events, venues] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.venue.findMany({
      where,
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50
    })
  ]);

  return [...events.map(eventToCandidate), ...venues.map(venueToCandidate)]
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

  const areaClause = input.area ? Prisma.sql`AND "area" = ${input.area}` : Prisma.empty;

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
          AND similarity(
            lower(concat_ws(' ', "title", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) > 0.03
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
          AND similarity(
            lower(concat_ws(' ', "name", coalesce("description", ''), coalesce("address", ''), array_to_string("tags", ' '))),
            lower(${query})
          ) > 0.03
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

async function loadCitySignalTags(input: RecommendInput) {
  try {
    const signals = await prisma.citySignal.findMany({
      where: {
        city: input.city,
        ...(input.area ? { area: input.area } : {}),
        ...(input.interests.length > 0
          ? {
              tag: {
                in: input.interests
              }
            }
          : {})
      },
      orderBy: {
        heatScore: "desc"
      },
      take: 20
    });

    return new Set(signals.map((signal) => signal.tag));
  } catch {
    return new Set<string>();
  }
}

function applyCitySignalRecall(candidates: Candidate[], citySignalTags: Set<string>) {
  if (citySignalTags.size === 0) {
    return candidates;
  }

  return candidates.map((candidate) =>
    candidate.tags.some((tag) => citySignalTags.has(tag))
      ? withRecall(candidate, ["city-signal"])
      : candidate
  );
}

export async function retrieveDatabaseCandidates(input: RecommendInput): Promise<Candidate[]> {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured");
  }

  const [baseResult, textResult, signalResult] = await Promise.allSettled([
    loadBaseCandidates(input),
    loadTextRecallCandidates(input),
    loadCitySignalTags(input)
  ]);
  const baseCandidates = baseResult.status === "fulfilled" ? baseResult.value : [];
  const textCandidates = textResult.status === "fulfilled" ? textResult.value : [];
  const citySignalTags = signalResult.status === "fulfilled" ? signalResult.value : new Set<string>();
  const merged = applyCitySignalRecall(
    dedupeCandidates([...baseCandidates, ...textCandidates]),
    citySignalTags
  );

  if (merged.length === 0 && baseResult.status === "rejected") {
    throw baseResult.reason;
  }

  return merged.sort((a, b) => b.trendScore - a.trendScore).slice(0, 80);
}
