import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("检查数据库状态...\n");

    const total = await prisma.venue.count();
    console.log(`总地点数: ${total}`);

    const amapCount = await prisma.venue.count({
      where: { source: "amap-poi" }
    });
    console.log(`高德地点数: ${amapCount}`);

    const xuhuiCount = await prisma.venue.count({
      where: {
        source: "amap-poi",
        area: "徐汇"
      }
    });
    console.log(`徐汇高德地点数: ${xuhuiCount}`);

    const qualifiedXuhui = await prisma.venue.count({
      where: {
        source: "amap-poi",
        area: "徐汇",
        qualityScore: { gte: 55 }
      }
    });
    console.log(`徐汇高质量地点数: ${qualifiedXuhui}`);

    // 检查示例数据
    const sample = await prisma.venue.findFirst({
      where: {
        source: "amap-poi",
        area: "徐汇"
      },
      orderBy: { createdAt: "desc" }
    });
    console.log(`\n最新导入示例: ${sample?.name} (质量分: ${sample?.qualityScore})`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("错误:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
