/**
 * AI 助手聊天暂存图服务。
 *
 * 与 submission/community 的 reserve→upload→complete 三段式不同,聊天图采用直传:
 * 服务端一次性接收文件 → sharp 校验/转码 → 上传到 chat-images 桶 → 建 ChatImage 行。
 * 返回 publicUrl 供视觉模型作为 image_url,以及 id 供第 3 层绑定到 post/submission。
 *
 * 状态机:TEMP(刚上传)→ ATTACHED(确认写操作时绑定)→ EXPIRED(超时清理)。
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/storage/supabase-admin";

const CHAT_IMAGE_BUCKET = process.env.CITYSENSE_CHAT_IMAGE_BUCKET ?? "chat-images";
const MAX_BYTES = Number(process.env.CITYSENSE_CHAT_MAX_IMAGE_BYTES ?? 10_485_760);
const MIN_EDGE = Number(process.env.CITYSENSE_CHAT_MIN_IMAGE_EDGE ?? 320);
const MAX_EDGE = Number(process.env.CITYSENSE_CHAT_MAX_IMAGE_EDGE ?? 2000);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type UploadedChatImage = {
  id: string;
  url: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
};

export class ChatImageError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ChatImageError";
  }
}

/**
 * 处理并持久化一张聊天图。所有校验失败抛 ChatImageError(客户端可见)。
 *
 * @param ownerUserId 上传者的 AppUser.id(已鉴权)
 * @param file        原始文件(Buffer + 声明 MIME)
 */
export async function uploadChatImage(input: {
  ownerUserId: string;
  bytes: Buffer;
  declaredMime: string;
}): Promise<UploadedChatImage> {
  if (input.bytes.length > MAX_BYTES) {
    throw new ChatImageError(`图片超过 ${Math.round(MAX_BYTES / 1_048_576)} MB 限制`);
  }
  if (!ALLOWED_MIME.has(input.declaredMime)) {
    throw new ChatImageError("仅支持 JPEG、PNG 和 WebP");
  }

  // sharp 解析真实格式,以检测结果为准(沿用 submission images.ts 的处理风格)。
  const source = sharp(input.bytes, { animated: false, limitInputPixels: 30_000_000 });
  let width: number;
  let height: number;
  try {
    const metadata = await source.metadata();
    const detectedMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : "";
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
      throw new ChatImageError("图片格式不支持");
    }
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < MIN_EDGE) {
      throw new ChatImageError(`图片分辨率过低,最短边需 ≥ ${MIN_EDGE}px`);
    }
    width = metadata.width;
    height = metadata.height;
  } catch (error) {
    if (error instanceof ChatImageError) throw error;
    throw new ChatImageError("图片解析失败,可能已损坏");
  }

  // 统一转 WebP,控制体积(复用同一 sharp 实例)。
  const processed = await source
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();

  const imageId = crypto.randomUUID();
  const objectPath = `chat/${input.ownerUserId}/${imageId}.webp`;
  const supabase = createSupabaseAdminClient();

  const upload = await supabase.storage.from(CHAT_IMAGE_BUCKET).upload(objectPath, processed, {
    contentType: "image/webp",
    upsert: false
  });
  if (upload.error) {
    throw new ChatImageError("图片存储失败,请稍后重试", 500);
  }

  // 取公共可访问 URL。bucket 需配置为 public;若为 private 则改用 getPublicUrl 不生效,这里假设 public。
  const { data: publicData } = supabase.storage.from(CHAT_IMAGE_BUCKET).getPublicUrl(objectPath);
  const publicUrl = publicData.publicUrl;

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  await prisma.chatImage.create({
    data: {
      id: imageId,
      ownerUserId: input.ownerUserId,
      status: "TEMP",
      objectPath,
      publicUrl,
      mimeType: "image/webp",
      byteSize: processed.length,
      width,
      height,
      sha256
    }
  });

  return {
    id: imageId,
    url: publicUrl,
    mimeType: "image/webp",
    byteSize: processed.length,
    width,
    height
  };
}

/**
 * 把暂存图标记为已绑定到某个 post/submission(第 3 层使用)。
 * 校验归属与状态,返回成功绑定的数量。
 */
export async function attachChatImages(input: {
  ownerUserId: string;
  imageIds: string[];
  kind: "post" | "submission";
  targetId: string;
}): Promise<number> {
  if (input.imageIds.length === 0) return 0;
  const result = await prisma.chatImage.updateMany({
    where: {
      id: { in: input.imageIds },
      ownerUserId: input.ownerUserId,
      status: "TEMP"
    },
    data: { status: "ATTACHED", attachedKind: input.kind, attachedId: input.targetId }
  });
  return result.count;
}

/** 按 id 加载属于某用户的暂存图(供视觉对话与绑定校验复用)。 */
export async function loadOwnedChatImages(input: {
  ownerUserId: string;
  imageIds: string[];
}) {
  if (input.imageIds.length === 0) return [];
  return prisma.chatImage.findMany({
    where: { id: { in: input.imageIds }, ownerUserId: input.ownerUserId }
  });
}

/**
 * 把暂存的聊天图绑定到新建的社区手记(第 3 层)。
 *
 * 流程:校验归属与 TEMP 状态 → 下载 chat bucket 的已处理字节 → 上传到 community originals
 * bucket → 创建对应 CommunityPostImage 行(直接置 READY)→ 标记 ChatImage 为 ATTACHED。
 *
 * 与 post-images.ts 的 reserve/complete 不同,这里跳过 RESERVED 中间态:
 * 聊天图早已经过 sharp 校验/转码,无需重复处理。
 */
export async function attachChatImagesToPost(input: {
  ownerUserId: string;
  imageIds: string[];
  postId: string;
}): Promise<{ attached: number; skipped: number }> {
  if (input.imageIds.length === 0) return { attached: 0, skipped: 0 };

  const images = await prisma.chatImage.findMany({
    where: { id: { in: input.imageIds }, ownerUserId: input.ownerUserId, status: "TEMP" }
  });
  if (images.length === 0) return { attached: 0, skipped: input.imageIds.length };

  const COMMUNITY_BUCKET = process.env.CITYSENSE_COMMUNITY_ORIGINAL_BUCKET ?? "community-originals";
  const supabase = createSupabaseAdminClient();

  // 取当前最大 position,保证 @@unique([postId, position]) 不冲突。
  const existing = await prisma.communityPostImage.findMany({
    where: { postId: input.postId },
    select: { position: true },
    orderBy: { position: "desc" }
  });
  let nextPosition = existing.length > 0 ? existing[0].position + 1 : 0;

  for (const chatImg of images) {
    const downloaded = await supabase.storage.from(CHAT_IMAGE_BUCKET).download(chatImg.objectPath);
    if (downloaded.error) continue;
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const targetPath = `${input.ownerUserId}/${input.postId}/${chatImg.id}.webp`;
    const upload = await supabase.storage.from(COMMUNITY_BUCKET).upload(targetPath, bytes, {
      contentType: "image/webp",
      upsert: false
    });
    if (upload.error) continue;

    await prisma.communityPostImage.create({
      data: {
        id: chatImg.id,
        postId: input.postId,
        uploaderId: input.ownerUserId,
        position: nextPosition,
        status: "READY",
        originalObjectPath: targetPath,
        processedObjectPath: targetPath,
        declaredMimeType: chatImg.mimeType,
        detectedMimeType: chatImg.mimeType,
        byteSize: chatImg.byteSize,
        width: chatImg.width,
        height: chatImg.height,
        sha256: chatImg.sha256,
        validatedAt: new Date()
      }
    });
    nextPosition += 1;
  }

  const result = await prisma.chatImage.updateMany({
    where: { id: { in: images.map((img) => img.id) }, status: "TEMP" },
    data: { status: "ATTACHED", attachedKind: "post", attachedId: input.postId }
  });

  return { attached: result.count, skipped: input.imageIds.length - result.count };
}

/**
 * 把暂存的聊天图绑定到新建的地点投稿(第 3 层)。
 * 流程同 attachChatImagesToPost,但创建 SubmissionImage 行(状态 SAFE)。
 */
export async function attachChatImagesToSubmission(input: {
  ownerUserId: string;
  imageIds: string[];
  submissionId: string;
}): Promise<{ attached: number; skipped: number }> {
  if (input.imageIds.length === 0) return { attached: 0, skipped: 0 };

  const images = await prisma.chatImage.findMany({
    where: { id: { in: input.imageIds }, ownerUserId: input.ownerUserId, status: "TEMP" }
  });
  if (images.length === 0) return { attached: 0, skipped: input.imageIds.length };

  const SUBMISSION_BUCKET = process.env.CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals";
  const supabase = createSupabaseAdminClient();

  for (const chatImg of images) {
    const downloaded = await supabase.storage.from(CHAT_IMAGE_BUCKET).download(chatImg.objectPath);
    if (downloaded.error) continue;
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const targetPath = `${input.ownerUserId}/${input.submissionId}/${chatImg.id}.webp`;
    const upload = await supabase.storage.from(SUBMISSION_BUCKET).upload(targetPath, bytes, {
      contentType: "image/webp",
      upsert: false
    });
    if (upload.error) continue;

    await prisma.submissionImage.create({
      data: {
        id: chatImg.id,
        submissionId: input.submissionId,
        status: "SAFE",
        originalObjectPath: targetPath,
        processedObjectPath: targetPath,
        declaredMimeType: chatImg.mimeType,
        detectedMimeType: chatImg.mimeType,
        byteSize: chatImg.byteSize,
        width: chatImg.width,
        height: chatImg.height,
        sha256: chatImg.sha256,
        validatedAt: new Date()
      }
    });
  }

  const result = await prisma.chatImage.updateMany({
    where: { id: { in: images.map((img) => img.id) }, status: "TEMP" },
    data: { status: "ATTACHED", attachedKind: "submission", attachedId: input.submissionId }
  });

  return { attached: result.count, skipped: input.imageIds.length - result.count };
}
