"use client";

import { useEffect, useState } from "react";

const EVENT_NAME = "community:follow-changed";

type FollowDetail = { userId: string; following: boolean; followerCount?: number };

export function CommunityFollowButton({ userId, viewerId, initialFollowing, returnTo, variant = "compact", onFollowingChange }: { userId: string; viewerId?: string; initialFollowing: boolean; returnTo: string; variant?: "profile" | "compact"; onFollowingChange?: (following: boolean, followerCount?: number) => void }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    function sync(event: Event) {
      const detail = (event as CustomEvent<FollowDetail>).detail;
      if (detail.userId !== userId) return;
      setFollowing(detail.following);
      onFollowingChange?.(detail.following, detail.followerCount);
    }
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, [onFollowingChange, userId]);
  if (viewerId === userId) return null;
  async function toggle(event: React.MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!viewerId) { window.location.href = `/login?next=${encodeURIComponent(returnTo)}`; return; }
    if (loading) return;
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(`/api/community/profiles/${encodeURIComponent(userId)}/follow`, { method: following ? "DELETE" : "PUT" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "关注操作失败");
      const detail: FollowDetail = { userId, following: result.following, followerCount: result.followerCount };
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "关注操作失败"); }
    finally { setLoading(false); }
  }
  return <span className="community-follow-wrap"><button aria-pressed={following} className={`community-follow-button ${variant}${following ? " active" : ""}`} disabled={loading} onClick={toggle} type="button">{loading ? "处理中…" : following ? "已关注" : "关注"}</button>{error ? <small className="community-follow-error" role="alert">{error}</small> : null}</span>;
}
