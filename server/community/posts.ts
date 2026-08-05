import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { createPostSchema, updatePostSchema } from "@/server/community/schema";
import { resolveBuddyRouteSnapshot } from "@/server/buddy/route-snapshot";

export const communityPostInclude = (viewerId?: string) => ({
  author: {
    include: {
      buddyProfile: true,
      ...(viewerId ? { communityFollowers: { where: { followerId: viewerId }, select: { followerId: true } } } : {})
    }
  },
  images: { where: { status: "READY" as const }, orderBy: { position: "asc" as const } },
  attachments: { include: { venue: true }, orderBy: { position: "asc" as const } },
  ...(viewerId ? {
    likes: { where: { userId: viewerId }, select: { userId: true } },
    bookmarks: { where: { userId: viewerId }, select: { userId: true } }
  } : {})
});

async function requirePublicProfile(userId: string) {
  const profile = await prisma.buddyPublicProfile.findUnique({ where: { userId } });
  if (!profile) throw new CommunityError("profile_required", "请先完善公开资料", 409);
  return profile;
}

async function resolveAttachments(input: { venueIds: string[]; routeSnapshotId?: string }, authorId: string) {
  const venueIds = [...new Set(input.venueIds)];
  const venues = venueIds.length ? await prisma.venue.findMany({
    where: { id: { in: venueIds }, publicationStatus: "PUBLISHED" },
    select: { id: true, name: true, area: true, address: true }
  }) : [];
  if (venues.length !== venueIds.length) throw new CommunityError("venue_not_available", "部分地点不存在或已下架", 400);
  const attachments: Prisma.CommunityPostAttachmentCreateWithoutPostInput[] = venues.map((venue, position) => ({
    type: "PLACE",
    position,
    venue: { connect: { id: venue.id } },
    titleSnapshot: venue.name,
    subtitleSnapshot: venue.area ?? venue.address
  }));
  if (input.routeSnapshotId) {
    const { snapshot, json } = await resolveBuddyRouteSnapshot(input.routeSnapshotId, authorId);
    attachments.push({
      type: "ROUTE",
      position: attachments.length,
      routeSnapshotId: input.routeSnapshotId,
      routeSnapshot: json,
      titleSnapshot: snapshot.title,
      subtitleSnapshot: snapshot.summary
    });
  }
  return attachments;
}

export async function createCommunityPost(input: {
  authorId: string;
  idempotencyKey?: string;
  payload: unknown;
}) {
  const data = createPostSchema.parse(input.payload);
  await requirePublicProfile(input.authorId);
  if (input.idempotencyKey) {
    const existing = await prisma.communityPost.findUnique({
      where: { authorId_idempotencyKey: { authorId: input.authorId, idempotencyKey: input.idempotencyKey } },
      include: communityPostInclude(input.authorId)
    });
    if (existing) return existing;
  }
  const attachments = await resolveAttachments(data, input.authorId);
  if (!data.body && attachments.length === 0) throw new CommunityError("empty_post", "请填写内容或添加地点、路线", 400);
  const publish = data.publish;
  return prisma.communityPost.create({
    data: {
      authorId: input.authorId,
      idempotencyKey: input.idempotencyKey,
      body: data.body,
      city: data.city,
      area: data.area,
      status: publish ? "PUBLISHED" : "DRAFT",
      moderationStatus: "PENDING",
      publishedAt: publish ? new Date() : undefined,
      attachments: { create: attachments },
      moderationActions: publish ? { create: { actorType: "USER", actorUserId: input.authorId, action: "PUBLISH", fromStatus: "DRAFT", toStatus: "PUBLISHED" } } : undefined
    },
    include: communityPostInclude(input.authorId)
  });
}

export async function updateCommunityPost(authorId: string, postId: string, payload: unknown) {
  const data = updatePostSchema.parse(payload);
  const post = await prisma.communityPost.findFirst({ where: { id: postId, authorId } });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  if (post.version !== data.expectedVersion) throw new CommunityError("version_conflict", "动态已被更新", 409);
  if (post.status !== "DRAFT") throw new CommunityError("post_not_editable", "已发布动态暂不支持编辑", 409);
  const attachments = data.venueIds || data.routeSnapshotId !== undefined
    ? await resolveAttachments({ venueIds: data.venueIds ?? [], routeSnapshotId: data.routeSnapshotId }, authorId)
    : undefined;
  return prisma.$transaction(async (tx) => {
    if (attachments) {
      await tx.communityPostAttachment.deleteMany({ where: { postId } });
      if (attachments.length) await tx.communityPostAttachment.createMany({
        data: attachments.map((attachment) => ({
          postId,
          type: attachment.type,
          position: attachment.position,
          venueId: attachment.venue?.connect?.id,
          routeSnapshotId: attachment.routeSnapshotId,
          routeSnapshot: attachment.routeSnapshot,
          titleSnapshot: attachment.titleSnapshot,
          subtitleSnapshot: attachment.subtitleSnapshot
        }))
      });
    }
    return tx.communityPost.update({
      where: { id: postId },
      data: { body: data.body, city: data.city, area: data.area, version: { increment: 1 } },
      include: communityPostInclude(authorId)
    });
  });
}

export async function publishCommunityPost(authorId: string, postId: string, expectedVersion: number) {
  const post = await prisma.communityPost.findFirst({
    where: { id: postId, authorId },
    include: { images: true, attachments: true }
  });
  if (!post) throw new CommunityError("post_not_found", "动态不存在", 404);
  if (post.status !== "DRAFT" || post.version !== expectedVersion) throw new CommunityError("version_conflict", "动态状态已更新", 409);
  if (!post.body && post.images.length === 0 && post.attachments.length === 0) throw new CommunityError("empty_post", "动态不能为空", 400);
  if (post.images.some((image) => image.status !== "READY")) throw new CommunityError("images_not_ready", "图片仍在处理中", 409);
  return prisma.communityPost.update({
    where: { id: postId },
    data: {
      status: "PUBLISHED",
      moderationStatus: "PENDING",
      publishedAt: new Date(),
      version: { increment: 1 },
      moderationActions: { create: { actorType: "USER", actorUserId: authorId, action: "PUBLISH", fromStatus: "DRAFT", toStatus: "PUBLISHED" } }
    },
    include: communityPostInclude(authorId)
  });
}

export async function deleteCommunityPost(authorId: string, postId: string) {
  const changed = await prisma.communityPost.updateMany({
    where: { id: postId, authorId, status: { in: ["DRAFT", "PUBLISHED"] } },
    data: { status: "REMOVED", deletedByAuthorAt: new Date(), version: { increment: 1 } }
  });
  if (!changed.count) throw new CommunityError("post_not_found", "动态不存在或不可删除", 404);
  return { ok: true };
}
