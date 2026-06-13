import { RecommendationWorkspace } from "@/components/RecommendationWorkspace";
import { recommend } from "@/server/recommendation/recommend";

export default async function Home() {
  const initialData = await recommend({
    city: "上海",
    origin: {
      lat: 31.224,
      lng: 121.459
    },
    interests: ["咖啡", "展览", "书店", "漫画", "独立音乐"],
    mood: "solo",
    budget: "medium",
    timeWindow: "tonight",
    useRealtimeTraffic: false,
    useSocialSignals: true
  });

  return <RecommendationWorkspace initialData={initialData} />;
}
