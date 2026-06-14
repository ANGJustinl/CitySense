import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("更新高德地图数据质量分数...\n");

  // 计算合理的质量分数
  const venues = await prisma.venue.findMany({
    where: {
      source: "amap-poi",
      qualityScore: 50
    }
  });

  console.log(`需要更新 ${venues.length} 个地点的质量分数`);

  let updated = 0;
  for (const venue of venues) {
    // 计算质量分数
    let score = 60; // 基础分

    // 有完整地址信息
    if (venue.address) {
      score += 10;
    }

    // 有坐标信息
    if (venue.lat && venue.lng) {
      score += 10;
    }

    // 有图片
    if (venue.imageUrl) {
      score += 5;
    }

    // 有详细描述
    if (venue.description && venue.description.length > 10) {
      score += 5;
    }

    // 标签数量
    if (venue.tags && venue.tags.length >= 3) {
      score += 5;
    }

    // 限制在 50-95 之间
    score = Math.min(95, Math.max(50, score));

    await prisma.venue.update({
      where: { id: venue.id },
      data: { qualityScore: score }
    });

    updated++;

    if (updated % 100 === 0) {
      console.log(`已更新 ${updated}/${venues.length} 个`);
    }
  }

  console.log(`\n完成！共更新 ${updated} 个地点`);

  // 验证结果
  const qualified = await prisma.venue.count({
    where: {
      source: "amap-poi",
      qualityScore: { gte: 55 }
    }
  });
  console.log(`质量分数 >= 55: ${qualified} 个`);
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
