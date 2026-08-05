import { prisma } from "@/server/db/prisma";
import type { BuddyNotificationType, Prisma } from "@prisma/client";

export async function createNotification(tx: Prisma.TransactionClient, input: {
  userId: string;
  type: BuddyNotificationType;
  actorUserId?: string;
  intentId?: string;
  applicationId?: string;
  groupId?: string;
  payload?: Prisma.InputJsonValue;
}) {
  return tx.buddyNotification.create({ data: input });
}

export async function listNotifications(userId: string, limit = 30) {
  const notifications = await prisma.buddyNotification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100)
  });
  const unread = await prisma.buddyNotification.count({ where: { userId, readAt: null } });
  return { notifications, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  return prisma.buddyNotification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() }
  });
}
