import { buildRecommendationTrace } from "@/server/recommendation/city-profile";
import { getUserProfile } from "@/server/recommendation/user-profile";
import { recommend } from "@/server/recommendation/recommend";
import { UserProfileView } from "@/components/city/UserProfileView";
import { DEFAULT_DEMO_USER_ID } from "@/lib/demo-users";

export const dynamic = "force-dynamic";

/**
 * 用户兴趣画像页。默认 demo 账号 user1，支持 ?userId=user2 切换。
 * 自定义 userId（非 demo）仍可用，但需显式传入。
 *
 * Search params: ?userId=user1&city=上海&area=静安寺
 */
export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ userId?: string; city?: string; area?: string }>;
}) {
  const params = await searchParams;
  // 默认 user1；接受任意 userId（含自定义），demo 账号优先。
  const userId = params.userId?.trim() || DEFAULT_DEMO_USER_ID;
  const city = params.city || "上海";
  const area = params.area || undefined;

  // Load the user's profile first so we can use their approved tags as
  // the recommendation input (closes the loop: profile → recommend → trace).
  const userProfile = await getUserProfile({ userId, city, area });

  // Use the user's approved tags if any; otherwise fall back to city defaults.
  const recommendInterests =
    userProfile.approvedTags.length > 0
      ? userProfile.approvedTags
      : ["咖啡", "展览", "书店"];

  const recommendation = await recommend({
    userId,
    city,
    area,
    interests: recommendInterests,
    mood: "solo",
    budget: "medium",
    timeWindow: "tonight",
    useSocialSignals: true
  });

  const [profile, trace] = await Promise.all([
    // Re-read the profile so candidate statuses reflect any concurrent changes.
    getUserProfile({ userId, city, area }),
    buildRecommendationTrace({ city, area, recommendation })
  ]);

  return (
    <UserProfileView
      area={area}
      city={city}
      initialProfile={profile}
      initialRecommendation={recommendation}
      initialTrace={trace}
    />
  );
}
