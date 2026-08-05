import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { moderationDecisionSchema } from "@/server/community/schema";

export async function listCommunityModerationQueue() {
  const [posts, comments, reports] = await Promise.all([
    prisma.communityPost.findMany({
      where: { OR: [{ moderationStatus: { in: ["PENDING", "FLAGGED"] } }, { reportCount: { gt: 0 } }] },
      include: { author: { include: { buddyProfile: true } }, images: { where: { status: "READY" } }, attachments: { include: { venue: true } } },
      orderBy: [{ reportCount: "desc" }, { publishedAt: "asc" }], take: 100
    }),
    prisma.communityComment.findMany({
      where: { OR: [{ moderationStatus: { in: ["PENDING", "FLAGGED"] } }, { reportCount: { gt: 0 } }] },
      include: { author: { include: { buddyProfile: true } }, post: { select: { id: true, body: true } } },
      orderBy: [{ reportCount: "desc" }, { createdAt: "asc" }], take: 100
    }),
    prisma.communityReport.findMany({
      where: { status: { in: ["OPEN", "REVIEWING"] } },
      include: { reporter: { include: { buddyProfile: true } } },
      orderBy: { createdAt: "asc" }, take: 100
    })
  ]);
  return { posts, comments, reports };
}

export async function decideCommunityPost(input: { actorUserId: string; actorType: "ADMIN" | "MODERATOR"; postId: string; payload: unknown }) {
  const decision = moderationDecisionSchema.parse(input.payload);
  const post = await prisma.communityPost.findUnique({ where: { id: input.postId } });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  if (decision.expectedVersion && decision.expectedVersion !== post.version) throw new CommunityError("version_conflict", "动态状态已更新", 409);
  const map = {
    APPROVE: { status: "PUBLISHED" as const, moderationStatus: "APPROVED" as const },
    HIDE: { status: "HIDDEN" as const, moderationStatus: "FLAGGED" as const },
    REMOVE: { status: "REMOVED" as const, moderationStatus: "REJECTED" as const },
    RESTORE: { status: "PUBLISHED" as const, moderationStatus: "APPROVED" as const }
  };
  if (decision.action === "DISMISS_REPORT") throw new CommunityError("invalid_action", "请在举报记录上忽略举报", 400);
  const next = map[decision.action];
  return prisma.$transaction(async (tx) => {
    const updated = await tx.communityPost.update({
      where: { id: post.id },
      data: {
        ...next,
        hiddenAt: next.status === "HIDDEN" ? new Date() : null,
        removedAt: next.status === "REMOVED" ? new Date() : null,
        moderationReason: decision.reasonText,
        version: { increment: 1 }
      }
    });
    await tx.communityModerationAction.create({
      data: {
        postId: post.id, actorUserId: input.actorUserId, actorType: input.actorType, action: decision.action,
        fromStatus: post.status, toStatus: next.status, reasonCode: decision.reasonCode, reasonText: decision.reasonText
      }
    });
    return updated;
  });
}

export async function decideCommunityComment(input: { actorUserId: string; actorType: "ADMIN" | "MODERATOR"; commentId: string; payload: unknown }) {
  const decision = moderationDecisionSchema.parse(input.payload);
  const comment = await prisma.communityComment.findUnique({ where: { id: input.commentId } });
  if (!comment) throw new CommunityError("comment_not_found", "评论不存在", 404);
  if (decision.expectedVersion && decision.expectedVersion !== comment.version) throw new CommunityError("version_conflict", "评论状态已更新", 409);
  if (decision.action === "DISMISS_REPORT") throw new CommunityError("invalid_action", "请在举报记录上忽略举报", 400);
  const next = decision.action === "APPROVE" || decision.action === "RESTORE"
    ? { status: "PUBLISHED" as const, moderationStatus: "APPROVED" as const }
    : decision.action === "HIDE"
      ? { status: "HIDDEN" as const, moderationStatus: "FLAGGED" as const }
      : { status: "REMOVED" as const, moderationStatus: "REJECTED" as const };
  return prisma.$transaction(async (tx) => {
    const updated = await tx.communityComment.update({ where: { id: comment.id }, data: { ...next, version: { increment: 1 } } });
    await tx.communityModerationAction.create({ data: { commentId: comment.id, actorUserId: input.actorUserId, actorType: input.actorType, action: decision.action, fromStatus: comment.status, toStatus: next.status, reasonCode: decision.reasonCode, reasonText: decision.reasonText } });
    return updated;
  });
}

export async function decideCommunityReport(input: { actorUserId: string; actorType: "ADMIN" | "MODERATOR"; reportId: string; payload: unknown }) {
  const decision = moderationDecisionSchema.parse(input.payload);
  if (decision.action !== "DISMISS_REPORT" && decision.action !== "APPROVE") throw new CommunityError("invalid_action", "举报操作无效", 400);
  const report = await prisma.communityReport.findUnique({ where: { id: input.reportId } });
  if (!report) throw new CommunityError("report_not_found", "举报不存在", 404);
  const status = decision.action === "DISMISS_REPORT" ? "DISMISSED" : "RESOLVED";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.communityReport.update({ where: { id: report.id }, data: { status, resolutionNote: decision.reasonText, resolvedAt: new Date() } });
    await tx.communityModerationAction.create({ data: { reportId: report.id, actorUserId: input.actorUserId, actorType: input.actorType, action: decision.action, fromStatus: report.status, toStatus: status, reasonCode: decision.reasonCode, reasonText: decision.reasonText, metadata: { targetType: report.targetType } as Prisma.InputJsonValue } });
    return updated;
  });
}
