"use client";

import { useCallback, useState } from "react";
import type { CommunityProfileView } from "@/server/community/types";
import { CommunityFollowButton } from "@/components/community/CommunityFollowButton";
import { UserAvatar } from "@/components/UserAvatar";

export function CommunityProfileHero({ profile, viewerId }: { profile: CommunityProfileView; viewerId?: string }) {
  const [followerCount, setFollowerCount] = useState(profile.followerCount ?? 0);
  const updateCount = useCallback((_following: boolean, count?: number) => {
    if (typeof count === "number") setFollowerCount(count);
  }, []);
  return <header className="community-profile-hero"><UserAvatar avatarUrl={profile.avatarUrl} className="community-avatar portrait" identity={profile.userId} name={profile.displayName} /><div><p className="eyebrow">CITY RESIDENT</p><h1>{profile.displayName}</h1><p>{profile.bio ?? "正在认真生活，也正在慢慢认识这座城市。"}</p><small>{profile.city ?? "城市未设置"}</small><CommunityFollowButton initialFollowing={Boolean(profile.viewerFollows)} onFollowingChange={updateCount} returnTo={`/community/profile/${profile.userId}`} userId={profile.userId} variant="profile" viewerId={viewerId} /></div><div className="community-profile-stats"><span><strong>{profile.postCount ?? 0}</strong>手记</span><span><strong>{followerCount}</strong>关注者</span><span><strong>{profile.followingCount ?? 0}</strong>正在关注</span></div></header>;
}
