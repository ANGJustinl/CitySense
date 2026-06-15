import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 检查高德地图数据质量 ===\n");

  // 质量分数分布
  const qualityDist = await prisma.venue.groupBy({
    by: ["qualityScore"],
    where: { source: "amap-poi" },
    _count: { id: true }
  });
  console.log("质量分数分布:");
  for (const item of qualityDist.sort((a, b) => a.qualityScore - b.qualityScore)) {
    console.log(`  分数 ${item.qualityScore}: ${item._count.id} 个`);
  }

  // 质量分数 >= 55 的数量
  const qualified = await prisma.venue.count({
    where: {
      source: "amap-poi",
      qualityScore: { gte: 55 }
    }
  });
  console.log(`\n质量分数 >= 55: ${qualified} 个`);

  // 有地址或坐标的数量
  const withLocation = await prisma.venue.count({
    where: {
      source: "amap-poi",
      OR: [
        { address: { not: null } },
        { AND: [{ lat: { not: null } }, { lng: { not: null } }] }
      ]
    }
  });
  console.log(`有地址或坐标: ${withLocation} 个`);

  // 同时满足条件的
  const fullyQualified = await prisma.venue.count({
    where: {
      source: "amap-poi",
      qualityScore: { gte: 55 },
      NOT: {
        qualityFlags: {
          has: "generic_social"
        }
      },
      OR: [
        { address: { not: null } },
        { AND: [{ lat: { not: null } }, { lng: { not: null } }] }
      ]
    }
  });
  console.log(`完全符合条件: ${fullyQualified} 个`);

  // 按区域分布
  const byArea = await prisma.venue.groupBy({
    by: ["area"],
    where: { source: "amap-poi" },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } }
  });
  console.log("\n按区域分布 (前10):");
  for (const item of byArea.slice(0, 10)) {
    console.log(`  ${item.area || "未知"}: ${item._count.id} 个`);
  }

  // 示例数据
  const samples = await prisma.venue.findMany({
    where: { source: "amap-poi" },
    take: 3,
    orderBy: { qualityScore: "desc" }
  });
  console.log("\n高质量数据示例:");
  for (const venue of samples) {
    console.log(`  - ${venue.name} (${venue.area})`);
    console.log(`    质量分: ${venue.qualityScore}, 地址: ${venue.address ? "有" : "无"}, 坐标: ${venue.lat && venue.lng ? "有" : "无"}`);
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
