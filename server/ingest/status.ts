import { prisma } from "@/server/db/prisma";
import { isDemoModeEnabled, isMockSourceName, MOCK_SOURCE_NAMES } from "@/server/config/demo-mode";
import { isIngestQueueConfigured } from "@/server/ingest/queue";
import { getSourceAdapters } from "@/server/sources/source-registry";

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

export type IngestNormalizationSourceCount = {
  source: string;
  count: number;
};

export type IngestNormalizationSummary = {
  pendingRaw: number;
  failedRaw: number;
  pendingBySource: IngestNormalizationSourceCount[];
  failedBySource: IngestNormalizationSourceCount[];
  lastNormalizedAt?: string;
};

export type IngestHealthStatus = "ready" | "degraded" | "blocked";

export type IngestHealthIssue = {
  severity: "info" | "warning" | "critical";
  code:
    | "redis_missing"
    | "source_auth_required"
    | "source_error"
    | "raw_backlog"
    | "raw_failed"
    | "normalize_stale"
    | "city_state_stale"
    | "no_recent_success";
  source?: string;
  message: string;
  action: string;
};

export type IngestSourceHealth = {
  source: string;
  status: string;
  lastSuccessAt?: string;
  pendingRaw: number;
  failedRaw: number;
  stale: boolean;
  requiresAuth: boolean;
  recommendationImpact: "high" | "medium" | "low";
};

export type IngestPipelineHealth = {
  redisConfigured: boolean;
  latestRunAt?: string;
  latestSuccessAt?: string;
  latestNormalizedAt?: string;
  latestCityStateAt?: string;
  pendingRaw: number;
  failedRaw: number;
  normalizeStale: boolean;
  cityStateStale: boolean;
};

export type IngestHealth = {
  overall: IngestHealthStatus;
  issues: IngestHealthIssue[];
  sourceHealth: IngestSourceHealth[];
  pipelineHealth: IngestPipelineHealth;
};

export type IngestStatusResponse = {
  queue: {
    configured: boolean;
  };
  normalization: IngestNormalizationSummary;
  health: IngestHealth;
  connectors: IngestConnectorView[];
  recentRuns: IngestRunView[];
  run?: IngestRunView;
};

const RAW_BACKLOG_WARNING_THRESHOLD = 100;
const RAW_FAILED_WARNING_THRESHOLD = 1;
const NORMALIZE_STALE_MS = 6 * 60 * 60 * 1000;
const CITY_STATE_STALE_MS = 6 * 60 * 60 * 1000;
const SOURCE_STALE_MS = 24 * 60 * 60 * 1000;
const RECENT_SUCCESS_STALE_MS = 24 * 60 * 60 * 1000;
const AUTH_REQUIRED_STATUSES = new Set(["not_configured", "paused"]);
const DIRECT_RECOMMENDATION_SOURCES = new Set(["amap-poi", "damai", "shanghai-gov"]);
const TREND_RECOMMENDATION_SOURCES = new Set([
  "xiaohongshu",
  "trends-hub",
  "douban",
  "bilibili"
]);

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function dateToIso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function emptyNormalizationSummary(): IngestNormalizationSummary {
  return {
    pendingRaw: 0,
    failedRaw: 0,
    pendingBySource: [],
    failedBySource: []
  };
}

function dateTime(value?: string) {
  if (!value) {
    return undefined;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
}

function latestIso(values: Array<string | undefined>) {
  const latest = values
    .map(dateTime)
    .filter((time): time is number => typeof time === "number")
    .sort((a, b) => b - a)[0];

  return latest ? new Date(latest).toISOString() : undefined;
}

function isOlderThan(value: string | undefined, maxAgeMs: number, now = Date.now()) {
  const time = dateTime(value);

  return time === undefined || now - time > maxAgeMs;
}

function sourceCountMap(items: IngestNormalizationSourceCount[]) {
  return new Map(items.map((item) => [item.source, item.count]));
}

function recommendationImpact(source: string): IngestSourceHealth["recommendationImpact"] {
  if (DIRECT_RECOMMENDATION_SOURCES.has(source)) {
    return "high";
  }

  if (TREND_RECOMMENDATION_SOURCES.has(source)) {
    return "medium";
  }

  return "low";
}

function issueSeverityRank(severity: IngestHealthIssue["severity"]) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export function buildIngestHealth(input: {
  queueConfigured: boolean;
  connectors: IngestConnectorView[];
  recentRuns: IngestRunView[];
  normalization: IngestNormalizationSummary;
  latestCityStateAt?: string;
  now?: number;
}): IngestHealth {
  const now = input.now ?? Date.now();
  const pendingBySource = sourceCountMap(input.normalization.pendingBySource);
  const failedBySource = sourceCountMap(input.normalization.failedBySource);
  const latestRunAt = latestIso(input.recentRuns.map((run) => run.createdAt));
  const latestSuccessAt = latestIso(input.connectors.map((connector) => connector.lastSuccessAt));
  const normalizeStale = isOlderThan(input.normalization.lastNormalizedAt, NORMALIZE_STALE_MS, now);
  const cityStateStale = isOlderThan(input.latestCityStateAt, CITY_STATE_STALE_MS, now);
  const sourceHealth = input.connectors.map((connector) => {
    const requiresAuth = AUTH_REQUIRED_STATUSES.has(connector.status);

    return {
      source: connector.source,
      status: connector.enabled ? connector.status : "disabled",
      lastSuccessAt: connector.lastSuccessAt,
      pendingRaw: pendingBySource.get(connector.source) ?? 0,
      failedRaw: failedBySource.get(connector.source) ?? 0,
      stale: connector.enabled && isOlderThan(connector.lastSuccessAt, SOURCE_STALE_MS, now),
      requiresAuth,
      recommendationImpact: recommendationImpact(connector.source)
    };
  });
  const issues: IngestHealthIssue[] = [];

  if (!input.queueConfigured) {
    issues.push({
      severity: "critical",
      code: "redis_missing",
      message: "Redis 队列未配置，采集任务无法入队。",
      action: "配置 REDIS_URL 并重启 Web 与 worker。"
    });
  }

  for (const source of sourceHealth) {
    if (source.requiresAuth) {
      issues.push({
        severity: source.recommendationImpact === "high" ? "warning" : "info",
        code: "source_auth_required",
        source: source.source,
        message: `${source.source} 需要配置或人工验证。`,
        action: "在来源管理页完成授权、验证码或环境变量配置。"
      });
    }

    if (source.status === "error") {
      issues.push({
        severity: source.recommendationImpact === "high" ? "warning" : "info",
        code: "source_error",
        source: source.source,
        message: `${source.source} 最近一次采集失败。`,
        action: "查看 connector 错误并重试采集；外站风控时先人工验证。"
      });
    }
  }

  if (input.normalization.pendingRaw >= RAW_BACKLOG_WARNING_THRESHOLD) {
    issues.push({
      severity: "warning",
      code: "raw_backlog",
      message: `待解析 Raw 已堆积 ${input.normalization.pendingRaw} 条。`,
      action: "启动 normalize worker，或按 source/ingestRunId 分批处理。"
    });
  }

  if (input.normalization.failedRaw >= RAW_FAILED_WARNING_THRESHOLD) {
    issues.push({
      severity: "warning",
      code: "raw_failed",
      message: `存在 ${input.normalization.failedRaw} 条 Raw 解析失败。`,
      action: "查看 failedBySource，修复 adapter/LLM normalization 后重放。"
    });
  }

  if (normalizeStale) {
    issues.push({
      severity: "warning",
      code: "normalize_stale",
      message: "Normalize 产物已超过 6 小时未更新。",
      action: "确认 normalize worker 正在运行，并检查 pending Raw。"
    });
  }

  if (cityStateStale) {
    issues.push({
      severity: "warning",
      code: "city_state_stale",
      message: "城市状态快照已超过 6 小时未刷新。",
      action: "启动 city-state worker，并在 Admin 页刷新城市状态。"
    });
  }

  if (isOlderThan(latestSuccessAt, RECENT_SUCCESS_STALE_MS, now) && input.connectors.length > 0) {
    issues.push({
      severity: "warning",
      code: "no_recent_success",
      message: "过去 24 小时没有成功采集记录。",
      action: "触发一次目标城市采集并确认 connector 状态。"
    });
  }

  const overall = !input.queueConfigured
    ? "blocked"
    : issues.some((issue) => issue.severity === "warning" || issue.severity === "critical")
      ? "degraded"
      : "ready";

  return {
    overall,
    issues: issues.sort(
      (a, b) => issueSeverityRank(b.severity) - issueSeverityRank(a.severity)
    ),
    sourceHealth,
    pipelineHealth: {
      redisConfigured: input.queueConfigured,
      latestRunAt,
      latestSuccessAt,
      latestNormalizedAt: input.normalization.lastNormalizedAt,
      latestCityStateAt: input.latestCityStateAt,
      pendingRaw: input.normalization.pendingRaw,
      failedRaw: input.normalization.failedRaw,
      normalizeStale,
      cityStateStale
    }
  };
}

export function normalizeSourceCounts(
  rows: Array<{ source: string; _count: { source?: number; id?: number } }>
): IngestNormalizationSourceCount[] {
  return rows
    .map((row) => ({
      source: row.source,
      count: row._count.source ?? row._count.id ?? 0
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

async function getNormalizationSummary(): Promise<IngestNormalizationSummary> {
  const [
    pendingRaw,
    failedRaw,
    pendingBySource,
    failedBySource,
    latestCitySignal,
    latestNormalizedRaw
  ] = await Promise.all([
    prisma.rawSourceItem.count({
      where: {
        status: "new"
      }
    }),
    prisma.rawSourceItem.count({
      where: {
        status: "error"
      }
    }),
    prisma.rawSourceItem.groupBy({
      by: ["source"],
      where: {
        status: "new"
      },
      _count: {
        source: true
      }
    }),
    prisma.rawSourceItem.groupBy({
      by: ["source"],
      where: {
        status: "error"
      },
      _count: {
        source: true
      }
    }),
    prisma.citySignal.findFirst({
      orderBy: {
        capturedAt: "desc"
      },
      select: {
        capturedAt: true
      }
    }),
    prisma.rawSourceItem.findFirst({
      where: {
        status: "normalized"
      },
      orderBy: {
        lastSeenAt: "desc"
      },
      select: {
        lastSeenAt: true
      }
    })
  ]);

  return {
    pendingRaw,
    failedRaw,
    pendingBySource: normalizeSourceCounts(pendingBySource),
    failedBySource: normalizeSourceCounts(failedBySource),
    lastNormalizedAt: dateToIso(
      latestCitySignal?.capturedAt ?? latestNormalizedRaw?.lastSeenAt
    )
  };
}

async function getLatestCityStateAt() {
  const latest = await prisma.cityConditionSnapshot.findFirst({
    orderBy: {
      capturedAt: "desc"
    },
    select: {
      capturedAt: true
    }
  });

  return dateToIso(latest?.capturedAt);
}

export async function syncSourceConnectors() {
  if (!hasDatabaseUrl()) {
    return;
  }

  const adapters = getSourceAdapters();

  await Promise.all(
    adapters.map((adapter) =>
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
  return getSourceAdapters().map((adapter) => ({
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

function visibleRunView(run: IngestRunView) {
  if (isDemoModeEnabled()) {
    return run;
  }

  return {
    ...run,
    sources: run.sources.filter((source) => !isMockSourceName(source))
  };
}

export async function getIngestStatus(runId?: string): Promise<IngestStatusResponse> {
  const adapters = getSourceAdapters();

  if (!hasDatabaseUrl()) {
    const queueConfigured = isIngestQueueConfigured();
    const connectors = staticConnectors();

    return {
      queue: {
        configured: queueConfigured
      },
      normalization: emptyNormalizationSummary(),
      health: buildIngestHealth({
        queueConfigured,
        connectors,
        recentRuns: [],
        normalization: emptyNormalizationSummary()
      }),
      connectors,
      recentRuns: []
    };
  }

  try {
    await syncSourceConnectors();

    const [connectors, recentRuns, run, normalization, latestCityStateAt] = await Promise.all([
      prisma.sourceConnector.findMany({
        where: isDemoModeEnabled()
          ? undefined
          : {
              name: {
                notIn: [...MOCK_SOURCE_NAMES]
              }
            },
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
        : Promise.resolve(null),
      getNormalizationSummary(),
      getLatestCityStateAt()
    ]);
    const connectorViews = connectors.map((connector) => {
      const adapter = adapters.find((item) => item.source === connector.name);
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
    });
    const recentRunViews = recentRuns.map(runView).map(visibleRunView);
    const queueConfigured = isIngestQueueConfigured();

    return {
      queue: {
        configured: queueConfigured
      },
      normalization,
      health: buildIngestHealth({
        queueConfigured,
        connectors: connectorViews,
        recentRuns: recentRunViews,
        normalization,
        latestCityStateAt
      }),
      connectors: connectorViews,
      recentRuns: recentRunViews,
      ...(run ? { run: visibleRunView(runView(run)) } : {})
    };
  } catch {
    const queueConfigured = isIngestQueueConfigured();
    const connectors = staticConnectors();

    return {
      queue: {
        configured: queueConfigured
      },
      normalization: emptyNormalizationSummary(),
      health: buildIngestHealth({
        queueConfigured,
        connectors,
        recentRuns: [],
        normalization: emptyNormalizationSummary()
      }),
      connectors,
      recentRuns: []
    };
  }
}

export const __testing = {
  buildIngestHealth
};
