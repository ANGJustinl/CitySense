import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  CityCondition,
  CityConditionDraft,
  CityConditionSnapshotLike,
  CityConditionSummary,
  CityConditionStatus
} from "@/server/city-state/types";
import { isCityStateRefreshQueueConfigured } from "@/server/city-state/queue";

const CONDITIONS: CityCondition[] = ["weather", "crowd", "sentiment", "freshness"];
const DEFAULT_MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function toDate(value: Date | string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : undefined;
}

function ageMinutes(capturedAt: Date | string | undefined, now = Date.now()) {
  const date = toDate(capturedAt);

  if (!date) {
    return undefined;
  }

  return Math.max(0, Math.round((now - date.getTime()) / 60_000));
}

function inputJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

function metadataObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function labelForCondition(condition: CityCondition, label?: string) {
  if (label) {
    return label;
  }

  if (condition === "weather") return "天气待刷新";
  if (condition === "crowd") return "人流待估算";
  if (condition === "sentiment") return "情绪待判断";
  return "状态新鲜度待确认";
}

function snapshotSpecificity(snapshot: CityConditionSnapshotLike, area?: string) {
  if (area && snapshot.area === area) {
    return 2;
  }

  if (!snapshot.area) {
    return 1;
  }

  return 0;
}

export function summarizeConditionSnapshot(
  snapshot: CityConditionSnapshotLike,
  now = Date.now()
): CityConditionSummary {
  const condition = snapshot.condition as CityCondition;
  const capturedAt = toDate(snapshot.capturedAt);
  const expiresAt = toDate(snapshot.expiresAt);
  const expired = expiresAt ? expiresAt.getTime() <= now : true;

  return {
    condition,
    label: labelForCondition(condition, snapshot.label ?? undefined),
    score: Math.round(snapshot.score),
    source: snapshot.source,
    confidence: Math.max(0, Math.min(1, Number(snapshot.confidence.toFixed(2)))),
    capturedAt: capturedAt?.toISOString(),
    expiresAt: expiresAt?.toISOString(),
    ageMinutes: ageMinutes(capturedAt, now),
    expired,
    area: snapshot.area ?? undefined,
    venueId: snapshot.venueId ?? undefined,
    metadata: metadataObject(snapshot.metadata)
  };
}

export function summarizeConditionSnapshots(
  snapshots: CityConditionSnapshotLike[],
  input: {
    area?: string;
    includeExpired?: boolean;
    now?: number;
  } = {}
): CityConditionSummary[] {
  const now = input.now ?? Date.now();
  const byCondition = new Map<CityCondition, CityConditionSnapshotLike>();

  for (const snapshot of snapshots) {
    const condition = snapshot.condition as CityCondition;

    if (!CONDITIONS.includes(condition)) {
      continue;
    }

    const expiresAt = toDate(snapshot.expiresAt);
    if (!input.includeExpired && expiresAt && expiresAt.getTime() <= now) {
      continue;
    }

    const current = byCondition.get(condition);
    if (!current) {
      byCondition.set(condition, snapshot);
      continue;
    }

    const currentSpecificity = snapshotSpecificity(current, input.area);
    const nextSpecificity = snapshotSpecificity(snapshot, input.area);
    const currentTime = toDate(current.capturedAt)?.getTime() ?? 0;
    const nextTime = toDate(snapshot.capturedAt)?.getTime() ?? 0;

    if (nextSpecificity > currentSpecificity || (nextSpecificity === currentSpecificity && nextTime > currentTime)) {
      byCondition.set(condition, snapshot);
    }
  }

  return CONDITIONS.flatMap((condition) => {
    const snapshot = byCondition.get(condition);
    return snapshot ? [summarizeConditionSnapshot(snapshot, now)] : [];
  });
}

export async function readLatestConditionSnapshots(input: {
  city: string;
  area?: string;
  venueId?: string;
  includeExpired?: boolean;
  maxAgeMs?: number;
}) {
  if (!hasDatabaseUrl()) {
    return [];
  }

  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_SNAPSHOT_AGE_MS;
  const capturedAfter = new Date(Date.now() - maxAgeMs);

  try {
    return await prisma.cityConditionSnapshot.findMany({
      where: {
        city: input.city,
        ...(input.venueId ? { venueId: input.venueId } : {}),
        ...(input.area
          ? {
              OR: [
                {
                  area: input.area
                },
                {
                  area: null
                }
              ]
            }
          : {}),
        capturedAt: {
          gte: capturedAfter
        },
        ...(input.includeExpired
          ? {}
          : {
              expiresAt: {
                gt: new Date()
              }
            })
      },
      orderBy: [
        {
          capturedAt: "desc"
        }
      ],
      take: 80
    });
  } catch {
    return [];
  }
}

export async function getLatestCityConditions(input: {
  city: string;
  area?: string;
  includeExpired?: boolean;
}) {
  const snapshots = await readLatestConditionSnapshots(input);

  return summarizeConditionSnapshots(snapshots, {
    area: input.area,
    includeExpired: input.includeExpired
  });
}

export async function upsertConditionSnapshot(draft: CityConditionDraft) {
  const existing = await prisma.cityConditionSnapshot.findFirst({
    where: {
      city: draft.city,
      area: draft.area ?? null,
      venueId: draft.venueId ?? null,
      condition: draft.condition,
      source: draft.source
    },
    orderBy: {
      capturedAt: "desc"
    }
  });
  const data = {
    city: draft.city,
    area: draft.area,
    venueId: draft.venueId,
    condition: draft.condition,
    score: draft.score,
    label: draft.label,
    source: draft.source,
    confidence: draft.confidence,
    metadata: inputJson(draft.metadata),
    capturedAt: draft.capturedAt,
    expiresAt: draft.expiresAt
  };

  if (existing) {
    return prisma.cityConditionSnapshot.update({
      where: {
        id: existing.id
      },
      data
    });
  }

  return prisma.cityConditionSnapshot.create({
    data
  });
}

export async function writeConditionSnapshots(drafts: CityConditionDraft[]) {
  if (!hasDatabaseUrl() || drafts.length === 0) {
    return [];
  }

  const snapshots = [];

  for (const draft of drafts) {
    snapshots.push(await upsertConditionSnapshot(draft));
  }

  return snapshots;
}

export async function getCityConditionStatus(input: {
  city: string;
  area?: string;
}): Promise<CityConditionStatus> {
  const conditions = await getLatestCityConditions({
    city: input.city,
    area: input.area,
    includeExpired: true
  });
  const latestTime = conditions
    .map((condition) => (condition.capturedAt ? new Date(condition.capturedAt).getTime() : 0))
    .filter((time) => Number.isFinite(time) && time > 0)
    .sort((a, b) => b - a)[0];

  return {
    city: input.city,
    area: input.area,
    queue: {
      configured: isCityStateRefreshQueueConfigured()
    },
    latestCapturedAt: latestTime ? new Date(latestTime).toISOString() : undefined,
    latestAgeMinutes: latestTime ? ageMinutes(new Date(latestTime)) : undefined,
    conditions
  };
}

export const __testing = {
  summarizeConditionSnapshot,
  summarizeConditionSnapshots
};
