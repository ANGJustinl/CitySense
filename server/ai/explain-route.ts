import type { RecommendedRoute, RecommendInput } from "@/server/recommendation/types";

function timeWindowText(timeWindow: RecommendInput["timeWindow"]) {
  if (timeWindow === "now") return "现在出发";
  if (timeWindow === "tonight") return "今晚";
  return "这个周末";
}

export async function explainRoutes(routes: RecommendedRoute[], input: RecommendInput) {
  return routes.map((route) => {
    const topSignal = route.sourceSignals[0];
    const firstPlace = route.places[0];
    const tags = [...new Set(route.places.flatMap((place) => place.tags))].slice(0, 3);

    return {
      ...route,
      reason: `${timeWindowText(input.timeWindow)}适合走这条线：${firstPlace?.name ?? "候选地点"} 和你的 ${tags.join("、")} 偏好重合，${topSignal?.label ?? "城市信号"} 支撑热度，交通大约 ${route.traffic.estimatedDurationMinutes} 分钟。`,
      tips: [
        route.traffic.congestion === "busy" ? "路上略忙，建议提前 10 分钟出发。" : "交通压力不高，可以按推荐顺序走。",
        input.mood === "quiet" ? "优先选择靠窗或角落位置，避开高峰停留。" : "可以把第一站作为集合点，后续按现场状态加减停留。",
        topSignal?.evidence ?? "推荐结果来自已沉淀的城市信号，不依赖实时爬虫。"
      ]
    };
  });
}
