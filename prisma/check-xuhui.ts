import { PrismaClient } from "@prisma/client";
import { areaVariants, areasMatch } from "@/server/geo/area-normalizer";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 检查徐汇区域数据 ===\n");

  const area = "徐汇";
  const variants = areaVariants(area);
  console.log(`区域 "${area}" 的变体:`, variants);

  // 统计徐汇区域的地点数量
  const totalByArea = await prisma.venue.count({
    where: {
      city: "上海",
      area: { in: variants }
    }
  });
  console.log(`\n徐汇区域总地点数: ${totalByArea}`);

  // 统计质量分数 >= 55 的地点数量
  const qualifiedByArea = await prisma.venue.count({
    where: {
      city: "上海",
      area: { in: variants },
      qualityScore: { gte: 55 }
    }
  });
  console.log(`徐汇区域质量分数 >= 55: ${qualifiedByArea}`);

  // 按来源分组
  const bySource = await prisma.venue.groupBy({
    by: ["source"],
    where: {
      city: "上海",
      area: { in: variants }
    },
    _count: { id: true }
  });
  console.log("\n按来源分组:");
  for (const item of bySource) {
    console.log(`  ${item.source}: ${item._count.id} 个`);
  }

  // 查看一些示例数据
  const samples = await prisma.venue.findMany({
    where: {
      city: "上海",
      area: { in: variants },
      source: "amap-poi"
    },
    take: 5,
    orderBy: { qualityScore: "desc" }
  });
  console.log("\n示例数据:");
  for (const venue of samples) {
    console.log(`  - ${venue.name}`);
    console.log(`    区域: ${venue.area}, 质量分: ${venue.qualityScore}, 坐标: ${venue.lat?.toFixed(4)},${venue.lng?.toFixed(4)}`);
    console.log(`    标签: ${venue.tags.join(", ")}`);
  }

  // 测试匹配逻辑
  console.log("\n=== 测试区域匹配 ===");
  const testAreas = ["徐汇", "徐汇区", "xuhui", "Xuhui"];
  for (const testArea of testAreas) {
    console.log(`"${testArea}" 匹配 "${area}": ${areasMatch(testArea, area)}`);
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
