import { recommend } from "@/server/recommendation/recommend";

async function main() {
  console.log("测试推荐 API...\n");

  const testInput = {
    city: "上海",
    area: "徐汇",
    interests: ["咖啡", "书店"],
    mood: "solo" as const,
    budget: "medium" as const,
    timeWindow: "now" as const
  };

  console.log("输入参数:", testInput);
  console.log();

  try {
    const result = await recommend(testInput);

    console.log("=== 推荐结果 ===");
    console.log(`推荐ID: ${result.meta.recommendationId}`);
    console.log(`候选地点数: ${result.meta.candidateCount}`);
    console.log(`召回渠道: ${result.meta.recallChannels.join(", ")}`);
    console.log(`生成路线数: ${result.routes.length}`);

    console.log("\n=== 路线详情 ===");
    for (let i = 0; i < Math.min(3, result.routes.length); i++) {
      const route = result.routes[i];
      console.log(`\n路线 ${i + 1}: ${route.title || "未命名"}`);
      console.log(`  停留点数: ${route.stops?.length || 0}`);
      console.log(`  描述: ${(route.description || "")?.substring(0, 100)}...`);

      const stops = route.stops;
      if (stops && Array.isArray(stops) && stops.length > 0) {
        for (let j = 0; j < Math.min(3, stops.length); j++) {
          const stop = stops[j];
          console.log(`    - ${stop.name} (${stop.type}) - 来源: ${stop.source}`);
        }
      }
    }

    // 统计来源
    const sources = new Map<string, number>();
    for (const route of result.routes) {
      for (const stop of route.stops) {
        sources.set(stop.source || "unknown", (sources.get(stop.source || "unknown") || 0) + 1);
      }
    }

    console.log("\n=== 数据来源统计 ===");
    for (const [source, count] of [...sources.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${source}: ${count} 个`);
    }
  } catch (error) {
    console.error("推荐失败:", error);
  }
}

main();
