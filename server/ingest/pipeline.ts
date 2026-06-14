import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  buildCitySignalRows,
  type NormalizedEntityInput
} from "@/server/ingest/normalize";
import {
  normalizeSourceItemForIngest,
  type LlmIngestNormalizeResult
} from "@/server/ingest/llm-normalizer";
import { createSourceKey } from "@/server/ingest/source-key";
import { matchXiaohongshuSignalsToAmapVenues } from "@/server/ingest/social-place-matcher";
import {
  applySourceResult,
  createEmptyIngestStats,
  type IngestStats,
  type SourceIngestResult
} from "@/server/ingest/types";
import { syncSourceConnectors } from "@/server/ingest/status";
import { assessCandidateQuality } from "@/server/recommendation/quality";
import { getSourceAdapters } from "@/server/sources/source-registry";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

type IngestRunRecord = NonNullable<Awaited<ReturnType<typeof prisma.ingestRun.findUnique>>>;
type RawSourceItemRecord = NonNullable<Awaited<ReturnType<typeof prisma.rawSourceItem.findUnique>>>;

export type NormalizePendingRawSourceItemsInput = {
  source?: string;
  ingestRunId?: string;
  limit?: number;
};

export type NormalizePendingRawSourceItemsResult = {
  scanned: number;
  normalized: number;
  ignored: number;
  failed: number;
  citySignalsCreated: number;
  errors: string[];
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function adapterBySource(source: string) {
  return getSourceAdapters().find((adapter) => adapter.source === source);
}

function isInCooldown(lastRunAt: Date | null, cooldownSeconds: number) {
  if (!lastRunAt || cooldownSeconds <= 0) {
    return false;
  }

  return Date.now() - lastRunAt.getTime() < cooldownSeconds * 1000;
}

async function updateRun(runId: string, data: Parameters<typeof prisma.ingestRun.update>[0]["data"]) {
  await prisma.ingestRun.update({
    where: {
      id: runId
    },
    data
  });
}

async function collectAdapterItems(run: IngestRunRecord, source: string) {
  const adapter = adapterBySource(source);
  if (!adapter) {
    throw new Error(`Unknown source: ${source}`);
  }
  const [events, venues] = await Promise.all([
    adapter.searchEvents({
      city: run.city,
      area: run.area ?? undefined,
      keywords: run.keywords
    }),
    adapter.searchVenues({
      city: run.city,
      area: run.area ?? undefined,
      keywords: run.keywords
    })
  ]);

  // 尝试获取预过滤统计（仅支持此功能的适配器，如小红书）
  let preFilteredCount = 0;
  if ('getLastPreFilteredCount' in adapter && typeof adapter.getLastPreFilteredCount === 'function') {
    preFilteredCount = (adapter as any).getLastPreFilteredCount();
  }

  return {
    items: [...events, ...venues],
    preFilteredCount
  };
}

async function upsertRawSourceItem(input: {
  item: RawSourceItemDetail;
  sourceKey: string;
  runId: string;
}) {
  const publishedAt = input.item.publishedAt ? new Date(input.item.publishedAt) : undefined;
  const validPublishedAt =
    publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : undefined;

  return prisma.rawSourceItem.upsert({
    where: {
      sourceKey: input.sourceKey
    },
    create: {
      source: input.item.source,
      sourceKey: input.sourceKey,
      sourceId: input.item.sourceId,
      sourceUrl: input.item.sourceUrl,
      title: input.item.title,
      content: input.item.content,
      author: input.item.author,
      rawPayload: toJson(input.item.rawPayload ?? input.item),
      parsedPayload: toJson(input.item),
      city: input.item.city,
      area: input.item.area,
      publishedAt: validPublishedAt,
      status: "new",
      itemType: input.item.itemType,
      ingestRunId: input.runId
    },
    update: {
      sourceId: input.item.sourceId,
      sourceUrl: input.item.sourceUrl,
      title: input.item.title,
      content: input.item.content,
      author: input.item.author,
      rawPayload: toJson(input.item.rawPayload ?? input.item),
      parsedPayload: toJson(input.item),
      city: input.item.city,
      area: input.item.area,
      publishedAt: validPublishedAt,
      status: "new",
      itemType: input.item.itemType,
      ingestRunId: input.runId,
      normalizedEntityType: null,
      normalizedEntityId: null,
      lastSeenAt: new Date()
    }
  });
}

function eventDataForEntity(entity: NormalizedEntityInput) {
  const quality = assessCandidateQuality({
    name: entity.title,
    type: entity.entityType,
    source: entity.source,
    address: entity.address,
    lat: entity.lat,
    lng: entity.lng,
    tags: entity.tags
  });
  // Preserve adapter-level quality flags (e.g. damai ticket_noise) alongside
  // the recomputed address/coords flags.
  const qualityFlags = [...new Set([...(entity.qualityFlags ?? []), ...quality.qualityFlags])];
  const values = {
    title: entity.title,
    description: entity.description ?? null,
    city: entity.city,
    area: entity.area ?? null,
    address: entity.address ?? null,
    lat: entity.lat ?? null,
    lng: entity.lng ?? null,
    startTime: entity.startTime ?? null,
    endTime: entity.endTime ?? null,
    tags: entity.tags,
    source: entity.source,
    sourceUrl: entity.sourceUrl ?? null,
    imageUrl: entity.imageUrl ?? null,
    imageSource: entity.imageUrl ? entity.source : null,
    trendScore: entity.trendScore,
    confidence: entity.confidence,
    qualityScore: quality.qualityScore,
    qualityFlags
  };

  return {
    create: {
      sourceKey: entity.sourceKey,
      ...values
    },
    update: values
  };
}

function venueDataForEntity(entity: NormalizedEntityInput) {
  const quality = assessCandidateQuality({
    name: entity.title,
    type: entity.entityType,
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

  return {
    create: {
      sourceKey: entity.sourceKey,
      ...values
    },
    update: values
  };
}

async function upsertNormalizedEntity(entity: NormalizedEntityInput | null) {
  if (!entity) {
    return null;
  }

  if (entity.entityType === "event") {
    const data = eventDataForEntity(entity);
    const event = await prisma.event.upsert({
      where: {
        sourceKey: entity.sourceKey
      },
      create: data.create,
      update: data.update
    });

    return {
      entityType: "event" as const,
      entityId: event.id
    };
  }

  const data = venueDataForEntity(entity);
  const venue = await prisma.venue.upsert({
    where: {
      sourceKey: entity.sourceKey
    },
    create: data.create,
    update: data.update
  });

  return {
    entityType: "venue" as const,
    entityId: venue.id
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function sourceSignals(value: unknown): RawSourceItemDetail["sourceSignals"] {
  return Array.isArray(value)
    ? value
        .filter((item): item is NonNullable<RawSourceItemDetail["sourceSignals"]>[number] => {
          if (!isRecord(item)) {
            return false;
          }

          return (
            typeof item.source === "string" &&
            typeof item.label === "string" &&
            typeof item.score === "number"
          );
        })
        .map((item) => ({
          source: item.source,
          label: item.label,
          score: item.score,
          evidence: typeof item.evidence === "string" ? item.evidence : undefined
        }))
    : undefined;
}

function rawSourceItemDetailFromRecord(row: RawSourceItemRecord): RawSourceItemDetail | null {
  const parsed = isRecord(row.parsedPayload) ? row.parsedPayload : {};
  const title = typeof parsed.title === "string" ? parsed.title : row.title;
  const city = typeof parsed.city === "string" ? parsed.city : row.city;
  const itemType = typeof parsed.itemType === "string" ? parsed.itemType : row.itemType;

  if (!title || !city || (itemType !== "event" && itemType !== "venue")) {
    return null;
  }

  return {
    id: typeof parsed.id === "string" ? parsed.id : row.sourceKey,
    source: row.source,
    sourceId: typeof parsed.sourceId === "string" ? parsed.sourceId : row.sourceId ?? undefined,
    sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : row.sourceUrl ?? undefined,
    title,
    content: typeof parsed.content === "string" ? parsed.content : row.content ?? undefined,
    author: typeof parsed.author === "string" ? parsed.author : row.author ?? undefined,
    rawPayload: parsed.rawPayload ?? row.rawPayload ?? undefined,
    city,
    area: typeof parsed.area === "string" ? parsed.area : row.area ?? undefined,
    publishedAt:
      typeof parsed.publishedAt === "string"
        ? parsed.publishedAt
        : row.publishedAt?.toISOString(),
    status: "new",
    itemType,
    address: typeof parsed.address === "string" ? parsed.address : undefined,
    lat: typeof parsed.lat === "number" ? parsed.lat : undefined,
    lng: typeof parsed.lng === "number" ? parsed.lng : undefined,
    startsAt: typeof parsed.startsAt === "string" ? parsed.startsAt : undefined,
    endsAt: typeof parsed.endsAt === "string" ? parsed.endsAt : undefined,
    imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : undefined,
    tags: stringArray(parsed.tags),
    trendScore: typeof parsed.trendScore === "number" ? parsed.trendScore : undefined,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    priceLevel: typeof parsed.priceLevel === "number" ? parsed.priceLevel : undefined,
    quietness: typeof parsed.quietness === "number" ? parsed.quietness : undefined,
    popularity: typeof parsed.popularity === "number" ? parsed.popularity : undefined,
    qualityFlags: stringArray(parsed.qualityFlags),
    sourceSignals: sourceSignals(parsed.sourceSignals)
  };
}

function parsedPayloadFor(
  item: RawSourceItemDetail,
  normalized: LlmIngestNormalizeResult
): Prisma.InputJsonValue {
  return toJson({
    ...item,
    llmNormalization: {
      status: normalized.status,
      model: normalized.model,
      ignoreReason: normalized.ignoreReason,
      error: normalized.error,
      output: normalized.output
    },
    normalizedEntity: normalized.entity
  });
}

async function clearExistingSignalsForRawItem(input: {
  item: RawSourceItemDetail;
  sourceKey: string;
  rawSourceItemId: string;
}) {
  await prisma.citySignalPlaceMatch.deleteMany({
    where: {
      source: input.item.source,
      rawSourceItemId: input.rawSourceItemId
    }
  });
  await prisma.$executeRaw`
    DELETE FROM "CitySignal"
    WHERE "source" = ${input.item.source}
      AND "metadata"->>'sourceKey' = ${input.sourceKey}
  `;
}

async function normalizeRawSourceItemRecord(input: {
  rawSourceItem: RawSourceItemRecord;
  item: RawSourceItemDetail;
}) {
  await clearExistingSignalsForRawItem({
    item: input.item,
    sourceKey: input.rawSourceItem.sourceKey,
    rawSourceItemId: input.rawSourceItem.id
  });
  const normalizedInput = await normalizeSourceItemForIngest({
    item: input.item,
    sourceKey: input.rawSourceItem.sourceKey
  });
  const normalized = await upsertNormalizedEntity(normalizedInput.entity);

  if (!normalized) {
    await prisma.rawSourceItem.update({
      where: {
        id: input.rawSourceItem.id
      },
      data: {
        status: "ignored",
        parsedPayload: parsedPayloadFor(input.item, normalizedInput),
        normalizedEntityType: null,
        normalizedEntityId: null
      }
    });

    return {
      normalized: false,
      citySignalsCreated: 0
    };
  }

  const signals = buildCitySignalRows(
    input.item,
    input.rawSourceItem.sourceKey,
    normalized.entityId,
    normalizedInput.entity ?? undefined
  );

  if (signals.length > 0) {
    if (input.item.source === "xiaohongshu" || input.item.source === "damai") {
      const createdSignals = [];

      for (const signal of signals) {
        createdSignals.push(
          await prisma.citySignal.create({
            data: {
              ...signal,
              metadata: toJson(signal.metadata)
            }
          })
        );
      }

      await matchXiaohongshuSignalsToAmapVenues({
        item: input.item,
        sourceKey: input.rawSourceItem.sourceKey,
        rawSourceItemId: input.rawSourceItem.id,
        normalizedEntity: normalizedInput.entity,
        citySignals: createdSignals
      });
    } else {
      await prisma.citySignal.createMany({
        data: signals.map((signal) => ({
          ...signal,
          metadata: toJson(signal.metadata)
        }))
      });
    }
  }

  await prisma.rawSourceItem.update({
    where: {
      id: input.rawSourceItem.id
    },
    data: {
      status: "normalized",
      parsedPayload: parsedPayloadFor(input.item, normalizedInput),
      normalizedEntityType: normalized.entityType,
      normalizedEntityId: normalized.entityId
    }
  });

  return {
    normalized: true,
    citySignalsCreated: signals.length
  };
}

export async function normalizeRawSourceItemById(rawSourceItemId: string) {
  const rawSourceItem = await prisma.rawSourceItem.findUnique({
    where: {
      id: rawSourceItemId
    }
  });

  if (!rawSourceItem) {
    throw new Error(`Raw source item not found: ${rawSourceItemId}`);
  }

  const item = rawSourceItemDetailFromRecord(rawSourceItem);

  if (!item) {
    await prisma.rawSourceItem.update({
      where: {
        id: rawSourceItem.id
      },
      data: {
        status: "error",
        parsedPayload: toJson({
          rawSourceItem,
          normalizeError: "invalid_raw_source_item_payload"
        })
      }
    });

    return {
      normalized: false,
      ignored: false,
      citySignalsCreated: 0
    };
  }

  try {
    const result = await normalizeRawSourceItemRecord({
      rawSourceItem,
      item
    });

    return {
      normalized: result.normalized,
      ignored: !result.normalized,
      citySignalsCreated: result.citySignalsCreated
    };
  } catch (error) {
    await prisma.rawSourceItem.update({
      where: {
        id: rawSourceItem.id
      },
      data: {
        status: "error",
        parsedPayload: toJson({
          ...item,
          normalizeError: error instanceof Error ? error.message : String(error)
        })
      }
    });

    throw error;
  }
}

export async function processPendingRawSourceItems(
  input: NormalizePendingRawSourceItemsInput = {}
): Promise<NormalizePendingRawSourceItemsResult> {
  const rows = await prisma.rawSourceItem.findMany({
    where: {
      status: "new",
      ...(input.source ? { source: input.source } : {}),
      ...(input.ingestRunId ? { ingestRunId: input.ingestRunId } : {})
    },
    orderBy: {
      lastSeenAt: "desc"
    },
    take: input.limit ?? 50
  });
  const result: NormalizePendingRawSourceItemsResult = {
    scanned: rows.length,
    normalized: 0,
    ignored: 0,
    failed: 0,
    citySignalsCreated: 0,
    errors: []
  };

  for (const row of rows) {
    try {
      const itemResult = await normalizeRawSourceItemById(row.id);

      result.normalized += itemResult.normalized ? 1 : 0;
      result.ignored += itemResult.ignored ? 1 : 0;
      result.citySignalsCreated += itemResult.citySignalsCreated;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${row.sourceKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

async function ingestSource(run: IngestRunRecord, source: string): Promise<SourceIngestResult> {
  const adapter = adapterBySource(source);

  if (!adapter) {
    return {
      source,
      status: "skipped",
      fetched: 0,
      rawUpserted: 0,
      normalized: 0,
      citySignalsCreated: 0,
      error: "unknown_source"
    };
  }
  const connector = await prisma.sourceConnector.findUnique({
    where: {
      name: source
    }
  });

  if (!connector?.enabled) {
    return {
      source,
      status: "skipped",
      fetched: 0,
      rawUpserted: 0,
      normalized: 0,
      citySignalsCreated: 0,
      error: "disabled"
    };
  }

  if (adapter.status !== "active") {
    await prisma.sourceConnector.update({
      where: {
        name: source
      },
      data: {
        status: adapter.status
      }
    });

    return {
      source,
      status: "skipped",
      fetched: 0,
      rawUpserted: 0,
      normalized: 0,
      citySignalsCreated: 0,
      error: adapter.status
    };
  }

  if (!run.force && isInCooldown(connector.lastRunAt, connector.cooldownSeconds)) {
    await prisma.sourceConnector.update({
      where: {
        name: source
      },
      data: {
        status: "cooldown",
        lastRunId: run.id
      }
    });

    return {
      source,
      status: "skipped",
      fetched: 0,
      rawUpserted: 0,
      normalized: 0,
      citySignalsCreated: 0,
      error: "cooldown"
    };
  }

  await prisma.sourceConnector.update({
    where: {
      name: source
    },
    data: {
      status: "active",
      lastRunId: run.id,
      lastRunAt: new Date()
    }
  });

  let fetched = 0;

  try {
    const collected = await collectAdapterItems(run, source);
    fetched = collected.items.length;
    let rawUpserted = 0;

    for (const item of collected.items) {
      const sourceKey = createSourceKey(item);
      await upsertRawSourceItem({
        item,
        sourceKey,
        runId: run.id
      });

      rawUpserted += 1;
    }

    await prisma.sourceConnector.update({
      where: {
        name: source
      },
      data: {
        status: "active",
        lastSuccessAt: new Date(),
        lastErrorAt: null,
        lastError: null
      }
    });

    return {
      source,
      status: "completed",
      fetched,
      preFilteredCount: collected.preFilteredCount,
      rawUpserted,
      normalized: 0,
      citySignalsCreated: 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown source error";

    await prisma.sourceConnector.update({
      where: {
        name: source
      },
      data: {
        status: "error",
        lastErrorAt: new Date(),
        lastError: message
      }
    });

    return {
      source,
      status: "failed",
      fetched,
      rawUpserted: 0,
      normalized: 0,
      citySignalsCreated: 0,
      error: message
    };
  }
}

function finalRunStatus(stats: IngestStats) {
  if (stats.sourcesFailed > 0 && stats.sourcesCompleted === 0) {
    return "failed";
  }

  if (stats.sourcesFailed > 0) {
    return "partial_failed";
  }

  return "completed";
}

export async function executeIngestRun(runId: string) {
  await syncSourceConnectors();

  const run = await prisma.ingestRun.findUnique({
    where: {
      id: runId
    }
  });

  if (!run) {
    throw new Error(`Ingest run not found: ${runId}`);
  }

  await updateRun(run.id, {
    status: "running",
    startedAt: new Date()
  });

  let stats = createEmptyIngestStats(run.sources.length);

  for (const source of run.sources) {
    const result = await ingestSource(run, source);
    stats = applySourceResult(stats, result);

    await updateRun(run.id, {
      stats: toJson(stats)
    });
  }

  const status = finalRunStatus(stats);

  await updateRun(run.id, {
    status,
    stats: toJson(stats),
    error: stats.errors.length > 0 ? stats.errors.join("; ") : null,
    finishedAt: new Date()
  });

  return {
    runId: run.id,
    status,
    stats
  };
}

export const __testing = {
  eventDataForEntity,
  venueDataForEntity,
  rawSourceItemDetailFromRecord
};
