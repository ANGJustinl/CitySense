import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { decodeCursor, encodeCursor } from "@/server/community/schema";
import { communityPostInclude } from "@/server/community/posts";
import { communityPost, communityProfile } from "@/server/community/visibility";

function cursorWhere(cursor?: { at: string; id: string }): Prisma.CommunityPostWhereInput {
  if (!cursor) return {};
  const at = new Date(cursor.at);
  return { OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: cursor.id } }] };
}

function blockWhere(viewerId?: string): Prisma.CommunityPostWhereInput {
  if (!viewerId) return {};
  return {
    author: {
      AND: [
        { buddyBlocksCreated: { none: { blockedId: viewerId } } },
        { buddyBlocksReceived: { none: { blockerId: viewerId } } }
      ]
    }
  };
}

export async function listCommunityFeed(input: {
  city: string;
  scope: "city" | "following";
  cursor?: string;
  limit: number;
  viewerId?: string;
  authorId?: string;
}) {
  if (input.scope === "following" && !input.viewerId) throw new CommunityError("auth_required", "请登录后查看关注动态", 401);
  const cursor = decodeCursor(input.cursor);
  const where: Prisma.CommunityPostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { not: null },
    author: { disabledAt: null },
    ...cursorWhere(cursor),
    ...blockWhere(input.viewerId),
    ...(input.authorId ? { authorId: input.authorId } : { city: input.city }),
    ...(input.scope === "following" ? { author: { communityFollowers: { some: { followerId: input.viewerId } }, disabledAt: null } } : {})
  };
  const posts = await prisma.communityPost.findMany({
    where,
    include: communityPostInclude(input.viewerId),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });
  const hasMore = posts.length > input.limit;
  const items = posts.slice(0, input.limit);
  const last = items.at(-1);
  return {
    posts: items.map((post) => communityPost(post, input.viewerId)),
    nextCursor: hasMore && last?.publishedAt ? encodeCursor({ at: last.publishedAt.toISOString(), id: last.id }) : null
  };
}

export async function getCommunityPost(postId: string, viewerId?: string) {
  const post = await prisma.communityPost.findFirst({
    where: { id: postId, status: "PUBLISHED", author: { disabledAt: null }, ...blockWhere(viewerId) },
    include: communityPostInclude(viewerId)
  });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  return communityPost(post, viewerId);
}

export async function getCommunityProfile(userId: string, viewerId?: string) {
  const profile = await prisma.buddyPublicProfile.findFirst({
    where: { userId, user: { disabledAt: null } },
    include: {
      user: {
        include: {
          communityPosts: { where: { status: "PUBLISHED" }, select: { id: true } },
          communityFollows: { select: { followingId: true } },
          communityFollowers: { select: { followerId: true } }
        }
      }
    }
  });
  if (!profile) throw new CommunityError("profile_not_found", "用户主页不存在", 404);
  return communityProfile(profile, {
    postCount: profile.user.communityPosts.length,
    followingCount: profile.user.communityFollows.length,
    followerCount: profile.user.communityFollowers.length,
    viewerFollows: viewerId ? profile.user.communityFollowers.some((follow) => follow.followerId === viewerId) : false
  });
}

export async function listBookmarks(userId: string, cursor?: string, limit = 20) {
  const decoded = decodeCursor(cursor);
  const bookmarks = await prisma.communityBookmark.findMany({
    where: {
      userId,
      post: { status: "PUBLISHED", ...blockWhere(userId) },
      ...(decoded ? { OR: [{ createdAt: { lt: new Date(decoded.at) } }, { createdAt: new Date(decoded.at), postId: { lt: decoded.id } }] } : {})
    },
    include: { post: { include: communityPostInclude(userId) } },
    orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
    take: limit + 1
  });
  const hasMore = bookmarks.length > limit;
  const items = bookmarks.slice(0, limit);
  const last = items.at(-1);
  return {
    posts: items.map((item) => communityPost(item.post, userId)),
    nextCursor: hasMore && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.postId }) : null
  };
}
