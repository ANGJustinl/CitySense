import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { BuddyError } from "@/server/buddy/errors";
import { blockBuddySchema, reportBuddySchema } from "@/server/buddy/schema";
import { toJson } from "@/server/buddy/visibility";

export async function listBuddyBlocks(userId: string) {
  return prisma.buddyBlock.findMany({ where: { blockerId: userId }, include: { blocked: { include: { buddyProfile: true } } }, orderBy: { createdAt: "desc" } });
}

export async function blockBuddyUser(userId: string, payload: unknown) {
  const input = blockBuddySchema.parse(payload);
  if (input.blockedUserId === userId) throw new BuddyError("cannot_block_self", "不能拉黑自己", 400);
  return prisma.$transaction(async (tx) => {
    const block = await tx.buddyBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: input.blockedUserId } }, create: { blockerId: userId, blockedId: input.blockedUserId, reason: input.reason }, update: { reason: input.reason } });
    await tx.buddyApplication.updateMany({ where: { status: "PENDING", OR: [{ applicantId: userId, intent: { ownerId: input.blockedUserId } }, { applicantId: input.blockedUserId, intent: { ownerId: userId } }] }, data: { status: "CANCELLED", version: { increment: 1 } } });
    const groups = await tx.buddyGroup.findMany({ where: { status: "ACTIVE", AND: [{ members: { some: { userId } } }, { members: { some: { userId: input.blockedUserId } } }] }, select: { id: true } });
    if (groups.length) {
      await tx.buddyGroup.updateMany({ where: { id: { in: groups.map((group) => group.id) } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "BLOCKED", version: { increment: 1 } } });
    }
    return block;
  });
}

export async function unblockBuddyUser(userId: string, blockedUserId: string) {
  await prisma.buddyBlock.deleteMany({ where: { blockerId: userId, blockedId: blockedUserId } });
  return { ok: true };
}

export async function reportBuddy(userId: string, payload: unknown, idempotencyKey?: string) {
  const input = reportBuddySchema.parse(payload);
  if (idempotencyKey) {
    const existing = await prisma.buddyReport.findUnique({ where: { reporterId_idempotencyKey: { reporterId: userId, idempotencyKey } } });
    if (existing) return existing;
  }
  const message = input.messageId ? await prisma.buddyMessage.findUnique({ where: { id: input.messageId } }) : null;
  const groupId = input.groupId ?? message?.groupId;
  if (groupId) {
    const member = await prisma.buddyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!member) throw new BuddyError("report_not_allowed", "无法举报该内容", 403);
  }
  return prisma.$transaction(async (tx) => {
    const report = await tx.buddyReport.create({ data: {
      reporterId: userId, reportedUserId: input.reportedUserId ?? message?.senderId, groupId, messageId: input.messageId,
      category: input.category, detail: input.detail, idempotencyKey,
      evidenceSnapshot: message ? toJson({ body: message.body, senderId: message.senderId, createdAt: message.createdAt.toISOString() }) : undefined
    } });
    if (input.blockUser && (input.reportedUserId ?? message?.senderId)) {
      const blockedId = (input.reportedUserId ?? message?.senderId)!;
      await tx.buddyBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId } }, create: { blockerId: userId, blockedId, reason: "REPORT" }, update: {} });
    }
    if (input.leaveGroup && groupId) {
      await tx.buddyGroup.updateMany({ where: { id: groupId, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "REPORT_AND_LEAVE", version: { increment: 1 } } });
      await tx.buddyGroupMember.updateMany({ where: { groupId, userId, status: "ACTIVE" }, data: { status: "LEFT", leftAt: new Date() } });
    }
    return report;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
