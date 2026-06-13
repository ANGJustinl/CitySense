import { PrismaClient } from "@prisma/client";
import { mockCatalog } from "@/server/sources/adapters/mock.adapter";

const prisma = new PrismaClient();

async function main() {
  await prisma.sourceConnector.createMany({
    data: [
      { name: "mock-city-signal", type: "mock", status: "active" },
      { name: "amap-poi", type: "api", status: process.env.AMAP_API_KEY ? "active" : "not_configured" },
      { name: "xiaohongshu", type: "crawler", status: "not_configured" },
      { name: "douban", type: "crawler", status: "not_configured" },
      { name: "bilibili", type: "mcp", status: "not_configured" }
    ],
    skipDuplicates: true
  });

  for (const item of mockCatalog) {
    if (item.itemType === "event") {
      await prisma.event.create({
        data: {
          title: item.title,
          description: item.content,
          city: item.city ?? "上海",
          area: item.area,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          startTime: item.startsAt ? new Date(item.startsAt) : undefined,
          tags: item.tags,
          source: item.source,
          sourceUrl: item.sourceUrl,
          trendScore: item.trendScore ?? 0,
          confidence: item.confidence ?? 0
        }
      });
    } else {
      await prisma.venue.create({
        data: {
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
        }
      });
    }
  }
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
