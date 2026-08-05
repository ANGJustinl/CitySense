import { buildRecommendationTrace } from "@/server/recommendation/city-profile";
import { getUserProfile } from "@/server/recommendation/user-profile";
import { recommend } from "@/server/recommendation/recommend";
import { UserProfileView } from "@/components/city/UserProfileView";
import { DEFAULT_DEMO_USER_ID, isDemoUser } from "@/lib/demo-users";
import { getOptionalUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * 用户兴趣画像页。默认 demo 账号 user1，支持 ?userId=user2 切换。
 *
 * Search params: ?userId=user1&city=上海&area=静安寺
 */
export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ userId?: string; city?: string; area?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getOptionalUser();
  const requestedUserId = params.userId?.trim();
  const demoUserId = isDemoUser(requestedUserId) ? requestedUserId! : DEFAULT_DEMO_USER_ID;
  const userId = viewer?.appUser.id ?? demoUserId;
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
    waypointCount: 3,
    useSocialSignals: true
  }, {
    ownerUserId: viewer?.appUser.id
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
      demoMode={!viewer}
      initialProfile={profile}
      initialRecommendation={recommendation}
      initialTrace={trace}
    />
  );
}
