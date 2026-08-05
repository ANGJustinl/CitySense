/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { reportSchema } from "@/server/community/schema";

export async function createCommunityReport(input: {
  reporterId: string;
  idempotencyKey?: string;
  payload: unknown;
}) {
  const data = reportSchema.parse(input.payload);
  if (input.idempotencyKey) {
    const existing = await prisma.communityReport.findUnique({ where: { reporterId_idempotencyKey: { reporterId: input.reporterId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return existing;
  }
  let post: any = null;
  let comment: any = null;
  let reportedUserId = data.reportedUserId;
  if (data.targetType === "POST") {
    post = await prisma.communityPost.findUnique({ where: { id: data.postId }, include: { images: true } });
    if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
    reportedUserId = post.authorId;
  } else if (data.targetType === "COMMENT") {
    comment = await prisma.communityComment.findUnique({ where: { id: data.commentId } });
    if (!comment) throw new CommunityError("comment_not_found", "评论不存在", 404);
    reportedUserId = comment.authorId;
  } else {
    const user = await prisma.appUser.findUnique({ where: { id: data.reportedUserId } });
    if (!user) throw new CommunityError("profile_not_found", "用户不存在", 404);
  }
  if (reportedUserId === input.reporterId) throw new CommunityError("self_report", "不能举报自己", 400);
  const evidence = {
    targetType: data.targetType,
    post: post ? { id: post.id, body: post.body, authorId: post.authorId, status: post.status, images: post.images.map((image: any) => image.publicUrl).filter(Boolean), createdAt: post.createdAt } : undefined,
    comment: comment ? { id: comment.id, body: comment.body, authorId: comment.authorId, status: comment.status, createdAt: comment.createdAt } : undefined,
    reportedUserId
  };
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.communityReport.create({
      data: {
        reporterId: input.reporterId,
        idempotencyKey: input.idempotencyKey,
        targetType: data.targetType,
        postId: data.postId,
        commentId: data.commentId,
        reportedUserId,
        category: data.category,
        detail: data.detail,
        evidenceSnapshot: JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue
      }
    });
    const count = data.targetType === "POST"
      ? (await tx.communityPost.update({ where: { id: data.postId! }, data: { reportCount: { increment: 1 } }, select: { reportCount: true } })).reportCount
      : data.targetType === "COMMENT"
        ? (await tx.communityComment.update({ where: { id: data.commentId! }, data: { reportCount: { increment: 1 } }, select: { reportCount: true } })).reportCount
        : 0;
    if (count >= 3 && data.targetType === "POST") {
      await tx.communityPost.update({ where: { id: data.postId! }, data: { status: "HIDDEN", moderationStatus: "FLAGGED", hiddenAt: new Date(), moderationReason: "multiple_reports", version: { increment: 1 } } });
      await tx.communityModerationAction.create({ data: { postId: data.postId, reportId: created.id, actorType: "SYSTEM", action: "AUTO_HIDE", fromStatus: "PUBLISHED", toStatus: "HIDDEN", reasonCode: "multiple_reports" } });
    }
    if (data.blockUser && reportedUserId) {
      await tx.buddyBlock.createMany({ data: { blockerId: input.reporterId, blockedId: reportedUserId, reason: "community_report" }, skipDuplicates: true });
      await tx.communityFollow.deleteMany({ where: { OR: [{ followerId: input.reporterId, followingId: reportedUserId }, { followerId: reportedUserId, followingId: input.reporterId }] } });
    }
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return report;
}
