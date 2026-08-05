import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { createCommentSchema, decodeCursor, encodeCursor } from "@/server/community/schema";
import { communityComment } from "@/server/community/visibility";

async function ensureCanInteract(userId: string, authorId: string) {
  if (userId === authorId) return;
  const blocked = await prisma.buddyBlock.findFirst({
    where: { OR: [{ blockerId: userId, blockedId: authorId }, { blockerId: authorId, blockedId: userId }] },
    select: { id: true }
  });
  if (blocked) throw new CommunityError("interaction_blocked", "当前无法与该用户互动", 403);
}

export async function listCommunityComments(postId: string, cursor?: string, limit = 30) {
  const post = await prisma.communityPost.findFirst({ where: { id: postId, status: "PUBLISHED" }, select: { id: true } });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  const decoded = decodeCursor(cursor);
  const comments = await prisma.communityComment.findMany({
    where: {
      postId,
      status: "PUBLISHED",
      ...(decoded ? { OR: [{ createdAt: { gt: new Date(decoded.at) } }, { createdAt: new Date(decoded.at), id: { gt: decoded.id } }] } : {})
    },
    include: { author: { include: { buddyProfile: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1
  });
  const hasMore = comments.length > limit;
  const items = comments.slice(0, limit);
  const last = items.at(-1);
  return {
    comments: items.map(communityComment),
    nextCursor: hasMore && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null
  };
}

export async function createCommunityComment(input: { postId: string; authorId: string; idempotencyKey?: string; payload: unknown }) {
  const data = createCommentSchema.parse(input.payload);
  const post = await prisma.communityPost.findFirst({ where: { id: input.postId, status: "PUBLISHED" }, select: { id: true, authorId: true } });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  await ensureCanInteract(input.authorId, post.authorId);
  const profile = await prisma.buddyPublicProfile.findUnique({ where: { userId: input.authorId } });
  if (!profile) throw new CommunityError("profile_required", "请先完善公开资料", 409);
  if (input.idempotencyKey) {
    const existing = await prisma.communityComment.findUnique({
      where: { authorId_idempotencyKey: { authorId: input.authorId, idempotencyKey: input.idempotencyKey } },
      include: { author: { include: { buddyProfile: true } } }
    });
    if (existing) return communityComment(existing);
  }
  return prisma.$transaction(async (tx) => {
    const comment = await tx.communityComment.create({
      data: { postId: input.postId, authorId: input.authorId, body: data.body, idempotencyKey: input.idempotencyKey },
      include: { author: { include: { buddyProfile: true } } }
    });
    await tx.communityPost.update({ where: { id: input.postId }, data: { commentCount: { increment: 1 } } });
    return communityComment(comment);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteCommunityComment(authorId: string, commentId: string) {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.communityComment.findFirst({ where: { id: commentId, authorId, status: "PUBLISHED" } });
    if (!comment) throw new CommunityError("comment_not_found", "评论不存在", 404);
    await tx.communityComment.update({ where: { id: commentId }, data: { status: "REMOVED", deletedAt: new Date(), version: { increment: 1 } } });
    await tx.communityPost.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
