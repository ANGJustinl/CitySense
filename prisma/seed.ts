import { demoSeedCatalog } from "@/prisma/demo-seed-data";
import { demoUserSeeds, type DemoInteractionSeed } from "@/prisma/demo-users";
import { isDemoModeEnabled } from "@/server/config/demo-mode";
import { prisma } from "@/server/db/prisma";
import { recomputeUserProfile } from "@/server/recommendation/user-profile-v2";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const demoMode = isDemoModeEnabled();

const connectors = [
  {
    name: "mock-city-signal",
    type: "mock",
    status: demoMode ? "active" : "disabled",
    enabled: demoMode,
    cooldownSeconds: 10
  },
  {
    name: "amap-poi",
    type: "api",
    status: process.env.AMAP_API_KEY ? "active" : "not_configured",
    enabled: Boolean(process.env.AMAP_API_KEY),
    cooldownSeconds: 300
  },
  {
    name: "xiaohongshu",
    type: "mcp",
    status: process.env.XIAOHONGSHU_MCP_URL ? "active" : "not_configured",
    enabled: Boolean(process.env.XIAOHONGSHU_MCP_URL),
    cooldownSeconds: 300
  },
  {
    name: "douban",
    type: "crawler",
    status: "not_configured",
    enabled: false,
    cooldownSeconds: 600
  },
  {
    name: "shanghai-gov",
    type: "crawler",
    status: "active",
    enabled: true,
    cooldownSeconds: 1800
  },
  {
    name: "bilibili",
    type: "mcp",
    status: process.env.BILIBILI_MCP_URL ? "active" : "not_configured",
    enabled: Boolean(process.env.BILIBILI_MCP_URL),
    cooldownSeconds: 300
  },
  {
    name: "trends-hub",
    type: "mcp",
    status: process.env.TRENDS_HUB_MCP_COMMAND ? "active" : "not_configured",
    enabled: Boolean(process.env.TRENDS_HUB_MCP_COMMAND),
    cooldownSeconds: 600
  }
];

function demoSourceKey(item: RawSourceItemDetail) {
  return `demo:${item.id}`;
}

function eventData(item: RawSourceItemDetail) {
  return {
    sourceKey: demoSourceKey(item),
    title: item.title,
    description: item.content,
    city: item.city ?? "上海",
    area: item.area,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    startTime: item.startsAt ? new Date(item.startsAt) : undefined,
    endTime: item.endsAt ? new Date(item.endsAt) : undefined,
    tags: item.tags,
    source: item.source,
    sourceUrl: item.sourceUrl,
    trendScore: item.trendScore ?? 0,
    confidence: item.confidence ?? 0
  };
}

function venueData(item: RawSourceItemDetail) {
  return {
    sourceKey: demoSourceKey(item),
    name: item.title,
    description: item.content,
    city: item.city ?? "上海",
    area: item.area,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    tags: item.tags,
    priceLevel: item.priceLevel,
    quietness: item.quietness,
    popularity: item.popularity,
    source: item.source,
    sourceUrl: item.sourceUrl,
    trendScore: item.trendScore ?? 0,
    confidence: item.confidence ?? 0
  };
}

async function seedConnectors() {
  for (const connector of connectors) {
    await prisma.sourceConnector.upsert({
      where: {
        name: connector.name
      },
      create: connector,
      update: {
        type: connector.type,
        status: connector.status,
        enabled: connector.enabled,
        cooldownSeconds: connector.cooldownSeconds
      }
    });
  }
}

async function seedDemoCatalog() {
  for (const item of demoSeedCatalog) {
    if (item.itemType === "event") {
      const data = eventData(item);

      await prisma.event.upsert({
        where: {
          sourceKey: data.sourceKey
        },
        create: data,
        update: data
      });

      continue;
    }

    const data = venueData(item);

    await prisma.venue.upsert({
      where: {
        sourceKey: data.sourceKey
      },
      create: data,
      update: data
    });
  }
}

/**
 * Seed demo 账号画像：为 user1/user2 写入 UserInteraction（action=up/save，
 * 走真实 feedback 通道），然后 recomputeUserProfile 聚合写入
 * UserPreference.metadata.profile。
 *
 * 幂等：每次先按 userId+recommendationNamespace 前缀删除旧 demo interaction，
 * 再 create，最后 recompute。重复 seed 不堆积。
 */
async function seedDemoUsers() {
  for (const user of demoUserSeeds) {
    // 查每条 interaction 对应的真实 Event/Venue 主键 id（按 sourceKey）。
    const resolvedInteractions: Array<{
      seed: DemoInteractionSeed;
      itemId: string;
    }> = [];

    for (const interaction of user.interactions) {
      const sourceKey = `demo:${interaction.seedId}`;
      const row =
        interaction.entityType === "event"
          ? await prisma.event.findUnique({ where: { sourceKey }, select: { id: true } })
          : await prisma.venue.findUnique({ where: { sourceKey }, select: { id: true } });

      if (!row) {
        // 对应 demo 条目不存在（catalog 未 seed），跳过；不阻塞其他账号。
        continue;
      }

      resolvedInteractions.push({ seed: interaction, itemId: row.id });
    }

    if (resolvedInteractions.length === 0) {
      continue;
    }

    // 幂等：删除该用户旧的 demo-seed interaction（按 recommendationId 前缀）。
    await prisma.userInteraction.deleteMany({
      where: {
        userId: user.userId,
        recommendationId: {
          startsWith: user.interactions[0]?.recommendationNamespace ?? "demo-"
        }
      }
    });

    // weight 与 feedback.ts feedbackToInteractionWeight 对齐：up:1 / save:1.5。
    const weightFor = (action: "up" | "save") => (action === "save" ? 1.5 : 1);

    // 写入新 interaction。每条 (recommendationId, routeId, itemId) 三元组唯一，
    // 不被 recomputeUserProfile 的 dedupeFeedbackInteractions 合并。
    for (const { seed, itemId } of resolvedInteractions) {
      const recommendationId = `${seed.recommendationNamespace}-rec`;
      const routeId = `${seed.recommendationNamespace}-route-${seed.seedId}`;
      await prisma.userInteraction.create({
        data: {
          userId: user.userId,
          recommendationId,
          routeId,
          itemId,
          itemType: seed.entityType,
          action: seed.action,
          weight: weightFor(seed.action),
          context: {
            tags: seed.contextTags,
            source: seed.contextSource,
            routeTitle: `${user.userId} demo seed`
          }
        }
      });
    }

    // 预生成画像快照，避免首次访问时实时重算。
    await recomputeUserProfile(user.userId);
  }
}

async function main() {
  await seedConnectors();
  await seedDemoCatalog();
  await seedDemoUsers();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
