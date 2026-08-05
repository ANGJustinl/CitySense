export type CommunityProfileView = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  viewerFollows?: boolean;
};

export type CommunityPostView = {
  id: string;
  body: string;
  city: string;
  area: string | null;
  status: string;
  moderationStatus: string;
  author: CommunityProfileView | null;
  images: Array<{ id: string; url: string; width: number | null; height: number | null; altText: string | null }>;
  attachments: Array<{
    id: string;
    type: "PLACE" | "ROUTE";
    title: string;
    subtitle: string | null;
    venueId: string | null;
    routeSnapshotId: string | null;
    route: unknown;
  }>;
  counts: { likes: number; comments: number; bookmarks: number };
  viewer: { liked: boolean; bookmarked: boolean; followsAuthor: boolean } | null;
  publishedAt: string | null;
  createdAt: string;
};

export type CommunityCommentView = {
  id: string;
  body: string;
  author: CommunityProfileView | null;
  publishedAt: string;
  createdAt: string;
};
