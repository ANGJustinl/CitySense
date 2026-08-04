import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  executeIngestRun,
  processPendingRawSourceItems
} from "@/server/ingest/pipeline";
import { getCityProfile } from "@/server/recommendation/city-profile";
import { recommend } from "@/server/recommendation/recommend";

type SmokeOptions = {
  city: string;
  area?: string;
  keywords: string[];
  limit: number;
  includeProfile: boolean;
  includeRecommend: boolean;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function parseOptions(): SmokeOptions {
  const keywords = (argValue("keywords") ?? "咖啡,展览")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const limit = Number(argValue("limit") ?? "20");

  return {
    city: argValue("city")?.trim() || "上海",
    area: argValue("area")?.trim() || undefined,
    keywords: keywords.length > 0 ? keywords : ["咖啡", "展览"],
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20,
    includeProfile: hasFlag("include-profile"),
    includeRecommend: hasFlag("include-recommend") && !hasFlag("skip-recommend")
  };
}

function requireEnv(name: string) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is not configured`);
  }
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function excerpt(value: unknown, limit = 220) {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (!text) {
    return undefined;
  }

  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function countRunCitySignals(sourceKeys: string[], since: Date) {
  if (sourceKeys.length === 0) {
    return 0;
  }

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "CitySignal"
    WHERE "source" = 'xiaohongshu'
      AND "metadata"->>'sourceKey' IN (${Prisma.join(sourceKeys)})
      AND "capturedAt" >= ${since}
  `;

  return rows[0]?.count ?? 0;
}

async function main() {
  requireEnv("DATABASE_URL");
  requireEnv("XIAOHONGSHU_MCP_URL");

  const options = parseOptions();
  const run = await prisma.ingestRun.create({
    data: {
      city: options.city,
      area: options.area,
      keywords: options.keywords,
      sources: ["xiaohongshu"],
      status: "queued",
      requestedBy: "xhs-ingest-smoke",
      force: true
    }
  });

  const ingest = await executeIngestRun(run.id);
  const normalize = await processPendingRawSourceItems({
    source: "xiaohongshu",
    ingestRunId: run.id,
    limit: options.limit,
    itemConcurrency: 1
  });
  const rawItems = await prisma.rawSourceItem.findMany({
    where: {
      source: "xiaohongshu",
      ingestRunId: run.id
    },
    orderBy: {
      lastSeenAt: "desc"
    },
    select: {
      id: true,
      sourceKey: true,
      title: true,
      status: true,
      itemType: true,
      sourceUrl: true,
      parsedPayload: true
    }
  });
  const sourceKeys = rawItems.map((item) => item.sourceKey);
  const runWindowStart = run.createdAt;
  const citySignalCount = await countRunCitySignals(sourceKeys, runWindowStart);
  const matchStats = await prisma.citySignalPlaceMatch.groupBy({
    by: ["status"],
    where: {
      source: "xiaohongshu",
      rawSourceItemId: {
        in: rawItems.map((item) => item.id)
      },
      createdAt: {
        gte: runWindowStart
      }
    },
    _count: {
      status: true
    }
  });
  const matchIssueSamples = await prisma.citySignalPlaceMatch.findMany({
    where: {
      source: "xiaohongshu",
      rawSourceItemId: {
        in: rawItems.map((item) => item.id)
      },
      createdAt: {
        gte: runWindowStart
      },
      status: {
        in: ["tool_error", "not_configured"]
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 5,
    select: {
      status: true,
      reason: true,
      createdAt: true,
      metadata: true
    }
  });
  const profile = options.includeProfile
    ? await getCityProfile({
        city: options.city,
        area: options.area
      })
    : undefined;
  let recommendation:
    | {
        routeCount: number;
        xhsSignalCount: number;
        xhsEvidenceSamples: string[];
      }
    | {
        error: string;
      }
    | undefined;

  if (options.includeRecommend) {
    try {
      const rec = await recommend({
        city: options.city,
        area: options.area,
        interests: options.keywords,
        mood: "solo",
        budget: "medium",
        timeWindow: "now",
        useRealtimeTraffic: false,
        useSocialSignals: true,
        sessionId: `xhs-smoke-${run.id}`
      });
      const xhsSignals = rec.routes.flatMap((route) =>
        route.sourceSignals.filter((signal) => signal.source === "xiaohongshu")
      );

      recommendation = {
        routeCount: rec.routes.length,
        xhsSignalCount: xhsSignals.length,
        xhsEvidenceSamples: xhsSignals
          .map((signal) => signal.evidence)
          .filter((item): item is string => Boolean(item))
          .slice(0, 3)
      };
    } catch (error) {
      recommendation = {
        error: summarizeError(error)
      };
    }
  }

  const output = {
    ok: rawItems.length > 0 && normalize.failed === 0,
    input: options,
    runId: run.id,
    ingest,
    normalize,
    database: {
      rawCount: rawItems.length,
      rawStatusCounts: rawItems.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
        return counts;
      }, {}),
      citySignalCount,
      matchStats: Object.fromEntries(
        matchStats.map((item) => [item.status, item._count.status])
      ),
      matchStatsSince: runWindowStart.toISOString(),
      matchIssueSamples: matchIssueSamples.map((match) => ({
        status: match.status,
        reason: match.reason,
        createdAt: match.createdAt,
        title: (match.metadata as { title?: string } | null)?.title
      })),
      samples: rawItems.slice(0, 5).map((item) => {
        const parsed = item.parsedPayload as
          | {
              sourceSignals?: { evidence?: string }[];
              rawPayload?: { answer?: string };
            }
          | null;

        return {
          sourceKey: item.sourceKey,
          title: item.title,
          status: item.status,
          itemType: item.itemType,
          sourceUrl: item.sourceUrl,
          aiEvidence: excerpt(parsed?.sourceSignals?.[0]?.evidence),
          aiAnswer: excerpt(parsed?.rawPayload?.answer)
        };
      })
    },
    cityProfile: profile
      ? {
          topTags: profile.topTags.slice(0, 5),
          representativeNotes: profile.representativeNotes.slice(0, 3),
          sourceStats: profile.sourceStats
        }
      : undefined,
    recommendation
  };

  console.log(JSON.stringify(output, null, 2));

  if (!output.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: summarizeError(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
