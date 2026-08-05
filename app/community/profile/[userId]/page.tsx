import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { getOptionalUser } from "@/server/auth/current-user";
import { getCommunityProfile, listCommunityFeed } from "@/server/community/feed";

export const dynamic = "force-dynamic";
export default async function CommunityProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params; const viewer = await getOptionalUser();
  const [profile, feed] = await Promise.all([getCommunityProfile(userId, viewer?.appUser.id), listCommunityFeed({ city: profileCityFallback(), scope: "city", authorId: userId, viewerId: viewer?.appUser.id, limit: 20 })]);
  return <main className="community-page-shell profile-page"><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>公开主页</span></nav><header className="community-profile-hero"><span className="community-avatar portrait">{profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : profile.displayName.slice(0,1)}</span><div><p className="eyebrow">CITY RESIDENT</p><h1>{profile.displayName}</h1><p>{profile.bio ?? "正在认真生活，也正在慢慢认识这座城市。"}</p><small>{profile.city ?? "城市未设置"}</small></div><div className="community-profile-stats"><span><strong>{profile.postCount ?? 0}</strong>手记</span><span><strong>{profile.followerCount ?? 0}</strong>关注者</span><span><strong>{profile.followingCount ?? 0}</strong>正在关注</span></div></header><CommunityFeed city={profile.city ?? "上海"} initialCursor={feed.nextCursor} initialPosts={feed.posts} viewerId={viewer?.appUser.id} /></main>;
}
function profileCityFallback(){ return "上海"; }
