import { RecommendationWorkspace } from "@/components/RecommendationWorkspace";
import { DEFAULT_DEMO_USER_ID, DEMO_USER_PERSONA_INTERESTS, isDemoUser } from "@/lib/demo-users";
import { getUserProfileSummary } from "@/server/recommendation/user-profile-v2";
import { recommend } from "@/server/recommendation/recommend";

export const dynamic = "force-dynamic";

/**
 * 首页：默认 demo 账号 user1，支持 ?userId=user2 切换。
 *
 * demo 账号的 interests 来自其画像 persona（召回源头分化）：
 * - user1 召回文艺静思向（展览/书店/咖啡/安静/漫画）
 * - user2 召回热闹潮流向（市集/独立音乐/livehouse/夜生活）
 * 这样从候选池就区分开来，叠加画像 affinity 排序权重，推荐一眼可辨。
 *
 * 若 demo 账号无画像数据（seed 未跑），回退到 persona 默认 interests。
 */
export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const params = await searchParams;
  // 只接受 demo 账号；其他自定义 userId 走默认 user1（避免任意输入穿透）。
  const userId = isDemoUser(params.userId) ? params.userId! : DEFAULT_DEMO_USER_ID;

  // 优先用画像 topPositiveTags 作为 interests；无画像时用 persona 默认。
  let interests = DEMO_USER_PERSONA_INTERESTS[userId] ?? ["咖啡", "展览", "书店"];
  try {
    const summary = await getUserProfileSummary(userId);
    if (summary.summary && summary.summary.topPositiveTags.length > 0) {
      interests = summary.summary.topPositiveTags.map((t) => t.tag);
    }
  } catch {
    // 画像读取失败回退 persona 默认。
  }

  const initialData = await recommend({
    userId,
    city: "上海",
    origin: {
      lat: 31.224,
      lng: 121.459,
      label: "默认起点",
      source: "default",
      provider: "default"
    },
    interests,
    mood: "solo",
    budget: "medium",
    timeWindow: "tonight",
    useRealtimeTraffic: false,
    useSocialSignals: true
  });

  return <RecommendationWorkspace initialData={initialData} initialUserId={userId} />;
}
