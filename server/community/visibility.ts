import type { CommunityCommentView, CommunityPostView, CommunityProfileView } from "@/server/community/types";

export function communityProfile(profile: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
}, extras: Partial<CommunityProfileView> = {}): CommunityProfileView {
  return { userId: profile.userId, displayName: profile.displayName, avatarUrl: profile.avatarUrl, bio: profile.bio, city: profile.city, ...extras };
}

export function communityPost(post: any, viewerId?: string): CommunityPostView {
  const authorProfile = post.author?.buddyProfile ?? null;
  return {
    id: post.id,
    body: post.body,
    city: post.city,
    area: post.area,
    status: post.status,
    moderationStatus: post.moderationStatus,
    author: authorProfile ? communityProfile(authorProfile) : null,
    images: (post.images ?? []).filter((image: any) => image.status === "READY" && image.publicUrl).map((image: any) => ({
      id: image.id,
      url: image.publicUrl,
      width: image.width,
      height: image.height,
      altText: image.altText
    })),
    attachments: (post.attachments ?? []).map((attachment: any) => ({
      id: attachment.id,
      type: attachment.type,
      title: attachment.venue?.publicationStatus === "REMOVED" ? "地点已下架" : attachment.titleSnapshot,
      subtitle: attachment.venue?.publicationStatus === "REMOVED" ? null : attachment.subtitleSnapshot,
      venueId: attachment.venue?.publicationStatus === "REMOVED" ? null : attachment.venueId,
      routeSnapshotId: attachment.routeSnapshotId,
      route: attachment.routeSnapshot
    })),
    counts: { likes: post.likeCount, comments: post.commentCount, bookmarks: post.bookmarkCount },
    viewer: viewerId ? {
      liked: Boolean(post.likes?.length),
      bookmarked: Boolean(post.bookmarks?.length),
      followsAuthor: Boolean(post.author?.communityFollowers?.length)
    } : null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString()
  };
}

export function communityComment(comment: any): CommunityCommentView {
  const profile = comment.author?.buddyProfile ?? null;
  return {
    id: comment.id,
    body: comment.deletedAt ? "评论已删除" : comment.body,
    author: profile ? communityProfile(profile) : null,
    publishedAt: comment.publishedAt.toISOString(),
    createdAt: comment.createdAt.toISOString()
  };
}
