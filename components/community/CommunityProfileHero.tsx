"use client";

import { useCallback, useState } from "react";
import { MapPin } from "lucide-react";
import type { CommunityProfileView } from "@/server/community/types";
import { CommunityFollowButton } from "@/components/community/CommunityFollowButton";
import { UserAvatar } from "@/components/UserAvatar";

export function CommunityProfileHero({ profile, viewerId }: { profile: CommunityProfileView; viewerId?: string }) {
  const [followerCount, setFollowerCount] = useState(profile.followerCount ?? 0);
  const updateCount = useCallback((_following: boolean, count?: number) => {
    if (typeof count === "number") setFollowerCount(count);
  }, []);
  return <header className="community-profile-hero"><UserAvatar avatarUrl={profile.avatarUrl} className="community-avatar portrait" identity={profile.userId} name={profile.displayName} /><div className="community-profile-copy"><p className="eyebrow">CITY RESIDENT · 城市居民</p><div><h1>{profile.displayName}</h1><span><MapPin aria-hidden="true" size={13} />{profile.city ?? "城市未设置"}</span></div><p>{profile.bio ?? "正在认真生活，也正在慢慢认识这座城市。"}</p><CommunityFollowButton initialFollowing={Boolean(profile.viewerFollows)} onFollowingChange={updateCount} returnTo={`/community/profile/${profile.userId}`} userId={profile.userId} variant="profile" viewerId={viewerId} /></div><dl className="community-profile-stats"><div><dt>手记</dt><dd>{profile.postCount ?? 0}</dd></div><div><dt>关注者</dt><dd>{followerCount}</dd></div><div><dt>正在关注</dt><dd>{profile.followingCount ?? 0}</dd></div></dl></header>;
}
