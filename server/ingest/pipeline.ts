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

  return {
    items: [...events, ...venues]
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

async function normalizeItem(input: {
  item: RawSourceItemDetail;
  sourceKey: string;
  runId: string;
}) {
  await upsertRawSourceItem(input);
  const normalizedInput = await normalizeSourceItemForIngest({
    item: input.item,
    sourceKey: input.sourceKey
  });
  const normalized = await upsertNormalizedEntity(normalizedInput.entity);

  if (!normalized) {
    await prisma.rawSourceItem.update({
      where: {
        sourceKey: input.sourceKey
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
    input.sourceKey,
    normalized.entityId,
    normalizedInput.entity ?? undefined
  );

  if (signals.length > 0) {
    await prisma.citySignal.createMany({
      data: signals.map((signal) => ({
        ...signal,
        metadata: toJson(signal.metadata)
      }))
    });
  }

  await prisma.rawSourceItem.update({
    where: {
      sourceKey: input.sourceKey
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
    let normalized = 0;
    let citySignalsCreated = 0;

    for (const item of collected.items) {
      const sourceKey = createSourceKey(item);
      const result = await normalizeItem({
        item,
        sourceKey,
        runId: run.id
      });

      rawUpserted += 1;
      normalized += result.normalized ? 1 : 0;
      citySignalsCreated += result.citySignalsCreated;
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
      rawUpserted,
      normalized,
      citySignalsCreated
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
  venueDataForEntity
};
