import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.venue.count();
  console.log("数据库中总地点数:", total);

  const bySource = await prisma.venue.groupBy({
    by: ["source"],
    _count: { id: true }
  });
  console.log("\n按来源分组:");
  for (const item of bySource) {
    console.log(`  ${item.source}: ${item._count.id} 个`);
  }

  // 查看一些示例
  const samples = await prisma.venue.findMany({
    take: 5,
    orderBy: { createdAt: "desc" }
  });
  console.log("\n最新导入的 5 个地点:");
  for (const venue of samples) {
    console.log(`  - ${venue.name} (${venue.area}) - ${venue.source}`);
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
