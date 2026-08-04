import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { enqueueNormalizeJob } from "@/server/ingest/queue";
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
type AdapterWithPreFilterStats = {
  getLastPreFilteredCount: () => number;
};

export type NormalizePendingRawSourceItemsInput = {
  source?: string;
  ingestRunId?: string;
  limit?: number;
  itemConcurrency?: number;
};

export type NormalizePendingRawSourceItemsResult = {
  scanned: number;
  normalized: number;
  ignored: number;
  failed: number;
  citySignalsCreated: number;
  errors: string[];
};

function boundedConcurrency(value: unknown, fallback = 1) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(8, Math.floor(parsed)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, boundedConcurrency(concurrency));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    })
  );

  return results;
}

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
  if (
    "getLastPreFilteredCount" in adapter &&
    typeof adapter.getLastPreFilteredCount === "function"
  ) {
    preFilteredCount = (adapter as AdapterWithPreFilterStats).getLastPreFilteredCount();
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

  const itemResults = await mapWithConcurrency(
    rows,
    boundedConcurrency(input.itemConcurrency),
    async (row) => {
      try {
        return {
          ...(await normalizeRawSourceItemById(row.id)),
          sourceKey: row.sourceKey
        };
      } catch (error) {
        return {
          normalized: false,
          ignored: false,
          citySignalsCreated: 0,
          sourceKey: row.sourceKey,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );

  for (const itemResult of itemResults) {
    result.normalized += itemResult.normalized ? 1 : 0;
    result.ignored += itemResult.ignored ? 1 : 0;
    result.citySignalsCreated += itemResult.citySignalsCreated;

    if (itemResult.error) {
      result.failed += 1;
      result.errors.push(`${itemResult.sourceKey}: ${itemResult.error}`);
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

function normalizeJobLimit() {
  const value = Number(process.env.NORMALIZE_JOB_LIMIT ?? process.env.NORMALIZE_WORKER_LIMIT ?? "20");

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20;
}

async function enqueuePostIngestNormalization(input: {
  runId: string;
  results: SourceIngestResult[];
  stats: IngestStats;
  enqueue?: typeof enqueueNormalizeJob;
}) {
  const completed = input.results.filter(
    (result) => result.status === "completed" && result.rawUpserted > 0
  );
  let stats = {
    ...input.stats,
    normalizeJobsQueued: input.stats.normalizeJobsQueued ?? 0,
    normalizeEnqueueErrors: input.stats.normalizeEnqueueErrors ?? []
  };

  for (const result of completed) {
    try {
      await (input.enqueue ?? enqueueNormalizeJob)({
        source: result.source,
        ingestRunId: input.runId,
        limit: normalizeJobLimit()
      });
      stats = {
        ...stats,
        normalizeJobsQueued: (stats.normalizeJobsQueued ?? 0) + 1
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "normalize enqueue failed";
      stats = {
        ...stats,
        normalizeEnqueueErrors: [
          ...(stats.normalizeEnqueueErrors ?? []),
          `${result.source}: ${message}`
        ]
      };
    }
  }

  return stats;
}

export async function executeIngestRun(runId: string) {
  try {
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
    const sourceResults: SourceIngestResult[] = [];

    for (const source of run.sources) {
      const result = await ingestSource(run, source);
      sourceResults.push(result);
      stats = applySourceResult(stats, result);

      await updateRun(run.id, {
        stats: toJson(stats)
      });
    }

    stats = await enqueuePostIngestNormalization({
      runId: run.id,
      results: sourceResults,
      stats
    });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      await prisma.ingestRun.updateMany({
        where: {
          id: runId,
          status: {
            in: ["queued", "running"]
          }
        },
        data: {
          error: message
        }
      });
    } catch {
      // Best-effort error annotation; rethrow the original worker error.
    }

    throw error;
  }
}

export const __testing = {
  eventDataForEntity,
  venueDataForEntity,
  rawSourceItemDetailFromRecord,
  enqueuePostIngestNormalization
};
