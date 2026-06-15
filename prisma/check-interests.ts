import { PrismaClient } from "@prisma/client";
import { areaVariants } from "@/server/geo/area-normalizer";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 检查兴趣匹配 ===\n");

  const area = "徐汇";
  const interests = ["咖啡", "书店"];
  const variants = areaVariants(area);

  console.log(`搜索区域: ${area} (${variants.join(", ")})`);
  console.log(`兴趣标签: ${interests.join(", ")}\n`);

  // 获取所有符合条件的地点
  const allVenues = await prisma.venue.findMany({
    where: {
      city: "上海",
      area: { in: variants },
      qualityScore: { gte: 55 }
    },
    take: 1000
  });

  console.log(`总符合条件的地点数: ${allVenues.length}\n`);

  // 检查兴趣匹配
  const matching: string[] = [];
  const nonMatching: { name: string; tags: string[]; reason: string }[] = [];

  for (const venue of allVenues) {
    const searchText = [
      venue.name,
      venue.description,
      venue.address,
      ...venue.tags
    ].filter(Boolean).join(" ").toLowerCase();

    const hasMatch = interests.some(interest =>
      searchText.includes(interest.toLowerCase()) ||
      venue.tags.some(tag => tag.toLowerCase().includes(interest.toLowerCase()))
    );

    if (hasMatch) {
      matching.push(venue.name);
    } else {
      // 记录为什么不匹配
      const tagText = venue.tags.join(", ");
      nonMatching.push({
        name: venue.name,
        tags: venue.tags,
        reason: `搜索文本: "${searchText.substring(0, 50)}..."`
      });
    }
  }

  console.log(`匹配地点数: ${matching.length}`);
  console.log(`不匹配地点数: ${nonMatching.length}\n`);

  console.log("=== 匹配的地点示例 ===");
  for (let i = 0; i < Math.min(10, matching.length); i++) {
    console.log(`  ✓ ${matching[i]}`);
  }

  console.log("\n=== 不匹配的地点示例 ===");
  for (let i = 0; i < Math.min(10, nonMatching.length); i++) {
    const item = nonMatching[i];
    console.log(`  ✗ ${item.name}`);
    console.log(`    标签: ${item.tags.join(", ")}`);
  }

  // 按标签分组
  const tagGroups = new Map<string, number>();
  for (const venue of allVenues) {
    for (const tag of venue.tags) {
      tagGroups.set(tag, (tagGroups.get(tag) || 0) + 1);
    }
  }

  console.log("\n=== 标签分布 (前20) ===");
  for (const [tag, count] of [...tagGroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${tag}: ${count} 个`);
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
