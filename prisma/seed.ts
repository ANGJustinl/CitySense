import { demoSeedCatalog } from "@/prisma/demo-seed-data";
import { prisma } from "@/server/db/prisma";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

const connectors = [
  {
    name: "mock-city-signal",
    type: "mock",
    status: "active",
    enabled: true,
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

async function main() {
  await seedConnectors();
  await seedDemoCatalog();
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
