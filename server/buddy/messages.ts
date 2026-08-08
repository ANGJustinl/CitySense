import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { BuddyError } from "@/server/buddy/errors";
import { sendBuddyMessageSchema, markBuddyReadSchema } from "@/server/buddy/schema";
import { canReadBuddyGroup, canSendMessage } from "@/server/buddy/state-machine";
import { createNotification } from "@/server/buddy/notifications";

async function groupReadAccess(userId: string, groupId: string) {
  const group = await prisma.buddyGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { user: { include: { buddyProfile: true } } } } }
  });
  const membership = group?.members.find((member) => member.userId === userId);
  if (!group || !membership || !canReadBuddyGroup(membership.status)) throw new BuddyError("group_not_found", "搭子行程不存在", 404);
  return { group, membership };
}

async function groupWriteAccess(userId: string, groupId: string) {
  const access = await groupReadAccess(userId, groupId);
  if (access.group.status !== "ACTIVE" || access.membership.status !== "ACTIVE") {
    throw new BuddyError("group_read_only", "这段搭子行程已归档，仅可查看", 409);
  }
  return access;
}

export async function listBuddyGroups(userId: string) {
  const groups = await prisma.buddyGroup.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: { include: { buddyProfile: true } } } } },
    orderBy: { createdAt: "desc" }, take: 50
  });
  return groups;
}

export async function getBuddyGroup(userId: string, groupId: string) {
  const { group, membership } = await groupReadAccess(userId, groupId);
  const unread = await prisma.buddyMessage.count({ where: { groupId, senderId: { not: userId }, createdAt: { gt: membership.lastReadMessageAt ?? new Date(0) } } });
  return { ...group, unread };
}

export async function listBuddyMessages(userId: string, groupId: string, after?: Date, limit = 50) {
  await groupReadAccess(userId, groupId);
  return prisma.buddyMessage.findMany({
    where: { groupId, ...(after ? { createdAt: { gt: after } } : {}) },
    include: { sender: { include: { buddyProfile: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(limit, 1), 100)
  });
}

export async function sendBuddyMessage(userId: string, groupId: string, payload: unknown) {
  const input = sendBuddyMessageSchema.parse(payload);
  const { group, membership } = await groupReadAccess(userId, groupId);
  const other = group.members.find((member) => member.userId !== userId && member.status === "ACTIVE");
  if (!other) throw new BuddyError("group_not_active", "搭子行程已结束", 409);
  const blocked = Boolean(await prisma.buddyBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: other.userId }, { blockerId: other.userId, blockedId: userId }] } }));
  if (!canSendMessage(group, membership.status, blocked)) throw new BuddyError("message_blocked", "当前无法发送消息", 409);
  const existing = await prisma.buddyMessage.findUnique({ where: { groupId_senderId_clientMessageId: { groupId, senderId: userId, clientMessageId: input.clientMessageId } } });
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const message = await tx.buddyMessage.create({ data: { groupId, senderId: userId, clientMessageId: input.clientMessageId, body: input.body } });
    await createNotification(tx, { userId: other.userId, type: "NEW_MESSAGE", actorUserId: userId, groupId, payload: JSON.parse(JSON.stringify({ preview: input.body.slice(0, 80) })) as Prisma.InputJsonValue });
    return message;
  });
}

export async function markBuddyMessagesRead(userId: string, groupId: string, payload: unknown) {
  const input = markBuddyReadSchema.parse(payload);
  const { membership } = await groupWriteAccess(userId, groupId);
  const readAt = input.readAt ?? new Date();
  if (membership.lastReadMessageAt && membership.lastReadMessageAt >= readAt) return membership;
  return prisma.buddyGroupMember.update({ where: { id: membership.id }, data: { lastReadMessageAt: readAt } });
}

export async function closeBuddyGroup(userId: string, groupId: string, action: "cancel" | "leave" | "complete", version: number) {
  const { group, membership } = await groupWriteAccess(userId, groupId);
  if (group.version !== version || group.status !== "ACTIVE") throw new BuddyError("version_conflict", "搭子行程状态已更新", 409);
  if (action === "complete") {
    return prisma.buddyGroup.update({ where: { id: groupId }, data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } } });
  }
  return prisma.$transaction(async (tx) => {
    const changed = await tx.buddyGroup.updateMany({ where: { id: groupId, status: "ACTIVE", version }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: action === "leave" ? "MEMBER_LEFT" : "OWNER_CANCELLED", version: { increment: 1 } } });
    if (changed.count !== 1) throw new BuddyError("version_conflict", "搭子行程状态已更新", 409);
    await tx.buddyGroupMember.update({ where: { id: membership.id }, data: { status: action === "leave" ? "LEFT" : "REMOVED", leftAt: new Date() } });
    const other = group.members.find((member) => member.userId !== userId);
    if (other) await createNotification(tx, { userId: other.userId, type: action === "leave" ? "MEMBER_LEFT" : "GROUP_CANCELLED", actorUserId: userId, groupId });
    return { ok: true };
  });
}
