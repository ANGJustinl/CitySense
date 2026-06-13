import { prisma } from "@/server/db/prisma";
import { isIngestQueueConfigured } from "@/server/ingest/queue";
import { sourceAdapters } from "@/server/sources/source-registry";

export type IngestConnectorView = {
  source: string;
  kind: string;
  enabled: boolean;
  status: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  cooldownSeconds: number;
};

export type IngestRunView = {
  id: string;
  city: string;
  area?: string;
  keywords: string[];
  sources: string[];
  status: string;
  requestedBy?: string;
  force: boolean;
  stats: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type IngestStatusResponse = {
  queue: {
    configured: boolean;
  };
  connectors: IngestConnectorView[];
  recentRuns: IngestRunView[];
  run?: IngestRunView;
};

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function dateToIso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

export async function syncSourceConnectors() {
  if (!hasDatabaseUrl()) {
    return;
  }

  await Promise.all(
    sourceAdapters.map((adapter) =>
      prisma.sourceConnector.upsert({
        where: {
          name: adapter.source
        },
        create: {
          name: adapter.source,
          type: adapter.kind,
          status: adapter.status,
          enabled: adapter.enabledByDefault,
          cooldownSeconds: adapter.cooldownSeconds
        },
        update: {
          type: adapter.kind,
          cooldownSeconds: adapter.cooldownSeconds
        }
      })
    )
  );
}

function staticConnectors(): IngestConnectorView[] {
  return sourceAdapters.map((adapter) => ({
    source: adapter.source,
    kind: adapter.kind,
    enabled: adapter.enabledByDefault,
    status: adapter.status,
    cooldownSeconds: adapter.cooldownSeconds
  }));
}

function runView(run: {
  id: string;
  city: string;
  area: string | null;
  keywords: string[];
  sources: string[];
  status: string;
  requestedBy: string | null;
  force: boolean;
  stats: unknown;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): IngestRunView {
  return {
    id: run.id,
    city: run.city,
    area: run.area ?? undefined,
    keywords: run.keywords,
    sources: run.sources,
    status: run.status,
    requestedBy: run.requestedBy ?? undefined,
    force: run.force,
    stats: run.stats,
    error: run.error ?? undefined,
    startedAt: dateToIso(run.startedAt),
    finishedAt: dateToIso(run.finishedAt),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}

export async function getIngestStatus(runId?: string): Promise<IngestStatusResponse> {
  if (!hasDatabaseUrl()) {
    return {
      queue: {
        configured: isIngestQueueConfigured()
      },
      connectors: staticConnectors(),
      recentRuns: []
    };
  }

  try {
    await syncSourceConnectors();

    const [connectors, recentRuns, run] = await Promise.all([
      prisma.sourceConnector.findMany({
        orderBy: {
          name: "asc"
        }
      }),
      prisma.ingestRun.findMany({
        orderBy: {
          createdAt: "desc"
        },
        take: 10
      }),
      runId
        ? prisma.ingestRun.findUnique({
            where: {
              id: runId
            }
          })
        : Promise.resolve(null)
    ]);

    return {
      queue: {
        configured: isIngestQueueConfigured()
      },
      connectors: connectors.map((connector) => {
        const adapter = sourceAdapters.find((item) => item.source === connector.name);
        const runtimeStatus = adapter?.status ?? connector.status;

        return {
          source: connector.name,
          kind: connector.type,
          enabled: connector.enabled,
          status: !connector.enabled
            ? "disabled"
            : runtimeStatus === "active"
              ? connector.status
              : runtimeStatus,
          lastRunAt: dateToIso(connector.lastRunAt),
          lastSuccessAt: dateToIso(connector.lastSuccessAt),
          lastErrorAt: dateToIso(connector.lastErrorAt),
          lastError: connector.lastError ?? undefined,
          cooldownSeconds: connector.cooldownSeconds
        };
      }),
      recentRuns: recentRuns.map(runView),
      ...(run ? { run: runView(run) } : {})
    };
  } catch {
    return {
      queue: {
        configured: isIngestQueueConfigured()
      },
      connectors: staticConnectors(),
      recentRuns: []
    };
  }
}
