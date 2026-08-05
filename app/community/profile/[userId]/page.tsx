import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { CommunityProfileHero } from "@/components/community/CommunityProfileHero";
import { getOptionalUser } from "@/server/auth/current-user";
import { getCommunityProfile, listCommunityFeed } from "@/server/community/feed";

export const dynamic = "force-dynamic";
export default async function CommunityProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params; const viewer = await getOptionalUser();
  const [profile, feed] = await Promise.all([getCommunityProfile(userId, viewer?.appUser.id), listCommunityFeed({ scope: "city", authorId: userId, viewerId: viewer?.appUser.id, limit: 20 })]);
  return <main className="community-page-shell profile-page"><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>公开主页</span></nav><CommunityProfileHero profile={profile} viewerId={viewer?.appUser.id} /><CommunityFeed context={{ kind: "profile", userId }} initialCursor={feed.nextCursor} initialPosts={feed.posts} viewerId={viewer?.appUser.id} copy={{ eyebrow: "CITY NOTES", title: `${profile.displayName} 的手记`, populated: "由本人发布的城市手记", empty: "还没有发布手记。" }} /></main>;
}
