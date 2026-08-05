import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";

async function publishedPost(postId: string) {
  const post = await prisma.communityPost.findFirst({ where: { id: postId, status: "PUBLISHED" }, select: { id: true, authorId: true } });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  return post;
}

async function ensureNotBlocked(userId: string, otherId: string) {
  if (userId === otherId) return;
  const blocked = await prisma.buddyBlock.findFirst({
    where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
    select: { id: true }
  });
  if (blocked) throw new CommunityError("interaction_blocked", "当前无法与该用户互动", 403);
}

export async function setPostLike(userId: string, postId: string, enabled: boolean) {
  const post = await publishedPost(postId);
  await ensureNotBlocked(userId, post.authorId);
  return prisma.$transaction(async (tx) => {
    if (enabled) {
      const created = await tx.communityPostLike.createMany({ data: { userId, postId }, skipDuplicates: true });
      if (created.count) await tx.communityPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
    } else {
      const removed = await tx.communityPostLike.deleteMany({ where: { userId, postId } });
      if (removed.count) await tx.communityPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
    }
    const current = await tx.communityPost.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
    return { liked: enabled, count: current.likeCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setPostBookmark(userId: string, postId: string, enabled: boolean) {
  const post = await publishedPost(postId);
  await ensureNotBlocked(userId, post.authorId);
  return prisma.$transaction(async (tx) => {
    if (enabled) {
      const created = await tx.communityBookmark.createMany({ data: { userId, postId }, skipDuplicates: true });
      if (created.count) await tx.communityPost.update({ where: { id: postId }, data: { bookmarkCount: { increment: 1 } } });
    } else {
      const removed = await tx.communityBookmark.deleteMany({ where: { userId, postId } });
      if (removed.count) await tx.communityPost.update({ where: { id: postId }, data: { bookmarkCount: { decrement: 1 } } });
    }
    return { bookmarked: enabled };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setCommunityFollow(followerId: string, followingId: string, enabled: boolean) {
  if (followerId === followingId) throw new CommunityError("self_follow", "不能关注自己", 400);
  const target = await prisma.appUser.findFirst({ where: { id: followingId, disabledAt: null, buddyProfile: { isNot: null } }, select: { id: true } });
  if (!target) throw new CommunityError("profile_not_found", "用户主页不存在", 404);
  await ensureNotBlocked(followerId, followingId);
  if (enabled) await prisma.communityFollow.createMany({ data: { followerId, followingId }, skipDuplicates: true });
  else await prisma.communityFollow.deleteMany({ where: { followerId, followingId } });
  return { following: enabled };
}
