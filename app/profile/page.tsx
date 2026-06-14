import Link from "next/link";
import { Activity, ArrowRight, User } from "lucide-react";
import {
  buildRecommendationTrace,
  getCityProfile
} from "@/server/recommendation/city-profile";
import { getUserProfile } from "@/server/recommendation/user-profile";
import { recommend } from "@/server/recommendation/recommend";
import { UserProfileView } from "@/components/city/UserProfileView";

export const dynamic = "force-dynamic";

/**
 * User interest profile page. Driven by `?userId=`:
 * - no userId → onboarding card (enter a userId to start)
 * - userId present → load that user's fused profile + run a recommendation
 *   using their approved tags, then build the reasoning trace.
 *
 * Search params: ?userId=user-001&city=上海&area=静安寺
 */
export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ userId?: string; city?: string; area?: string }>;
}) {
  const params = await searchParams;
  const userId = params.userId?.trim();
  const city = params.city || "上海";
  const area = params.area || undefined;

  // No userId → onboarding. Don't prefetch anything heavy.
  if (!userId) {
    return <UserIdOnboarding city={city} area={area} />;
  }

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

function UserIdOnboarding({ city, area }: { city: string; area?: string }) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <User size={20} />
          </span>
          <div>
            <p className="eyebrow">CitySense · 用户兴趣画像</p>
            <h1>你的兴趣画像</h1>
          </div>
        </div>
        <nav className="top-actions" aria-label="primary">
          <Link href="/">工作台</Link>
          <Link href="/admin/sources">Sources</Link>
        </nav>
      </header>

      <div className="profile-page">
        <section className="profile-section onboarding">
          <div className="section-heading">
            <Activity size={18} />
            <span>开始建立你的画像</span>
          </div>
          <p className="profile-intro">
            告诉我们你是谁，我们会基于你的城市热度、历史反馈和表态，逐步建立专属兴趣画像。
            认可的标签会直接影响你的推荐结果。
          </p>

          <form
            action="/profile"
            className="onboarding-form"
            method="get"
          >
            <label className="field">
              <span>用户标识</span>
              <input
                autoFocus
                name="userId"
                placeholder="例如 user-001 或你的昵称"
                required
                type="text"
              />
            </label>
            <input name="city" type="hidden" value={city} />
            {area ? <input name="area" type="hidden" value={area} /> : null}
            <button className="primary-button" type="submit">
              进入我的画像
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="profile-status-note">
            输入一个用户标识即可开始建立画像。同一标识的表态会被记住，下次进入时继续。
          </p>
        </section>
      </div>
    </main>
  );
}
