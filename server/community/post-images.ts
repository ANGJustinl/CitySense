/**
 * 社区手记图片服务(写路径)。
 *
 * 镜像 server/submissions/images.ts 的 reserve→upload→complete 三段式:
 *  - reserve:校验手记归属 + DRAFT 状态 + 数量上限,签发 Supabase 上传 URL,建 RESERVED 行。
 *  - complete:下载原图,sharp 校验(格式/分辨率/体积),转 WebP 写回,行状态置 READY。
 *
 * 读路径(publishCommunityPost 检查 status===READY、communityPostInclude 加载 READY 图片)
 * 早已就绪,本服务补齐从未实现的写路径。
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/storage/supabase-admin";

const ORIGINAL_BUCKET = process.env.CITYSENSE_COMMUNITY_ORIGINAL_BUCKET ?? "community-originals";
const MAX_IMAGES = Number(process.env.CITYSENSE_COMMUNITY_MAX_IMAGES ?? 9);
const MAX_BYTES = Number(process.env.CITYSENSE_COMMUNITY_MAX_IMAGE_BYTES ?? 10_485_760);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function reservePostImage(input: {
  postId: string;
  uploaderId: string;
  mimeType: string;
}) {
  if (!ALLOWED_MIME.has(input.mimeType)) throw new Error("仅支持 JPEG、PNG 和 WebP");
  // 作者可为 DRAFT 或已发布(PUBLISHED)手记附图;REMOVED/HIDDEN 不允许。
  // 聊天确认路径会先 publish:true 创建手记,因此允许 PUBLISHED 状态附图。
  const post = await prisma.communityPost.findFirst({
    where: { id: input.postId, authorId: input.uploaderId, status: { in: ["DRAFT", "PUBLISHED"] } },
    include: { images: { where: { status: { not: "DELETED" } } } }
  });
  if (!post) throw new Error("手记不存在或不可编辑");
  if (post.images.length >= MAX_IMAGES) throw new Error(`图片数量已达上限(${MAX_IMAGES} 张)`);

  const imageId = crypto.randomUUID();
  const path = `${input.uploaderId}/${input.postId}/${imageId}`;
  const supabase = createSupabaseAdminClient();
  const token = await supabase.storage.from(ORIGINAL_BUCKET).createSignedUploadUrl(path);
  if (token.error) throw token.error;

  // position 取当前最大值 +1(保证 @@unique([postId, position]) 不冲突)。
  const nextPosition = post.images.reduce((max, img) => Math.max(max, img.position), -1) + 1;

  const image = await prisma.communityPostImage.create({
    data: {
      id: imageId,
      postId: input.postId,
      uploaderId: input.uploaderId,
      position: nextPosition,
      originalObjectPath: path,
      declaredMimeType: input.mimeType
    }
  });
  return { image, path, token: token.data.token };
}

export async function completePostImage(input: {
  postId: string;
  imageId: string;
  uploaderId: string;
}) {
  const image = await prisma.communityPostImage.findFirst({
    where: { id: input.imageId, postId: input.postId, uploaderId: input.uploaderId }
  });
  if (!image) throw new Error("图片不存在");
  if (image.status === "READY") return image;

  const supabase = createSupabaseAdminClient();
  const downloaded = await supabase.storage.from(ORIGINAL_BUCKET).download(image.originalObjectPath);
  if (downloaded.error) throw downloaded.error;

  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("图片体积超过限制");

  const source = sharp(bytes, { animated: false, limitInputPixels: 30_000_000 });
  try {
    const metadata = await source.metadata();
    const detectedMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : undefined;
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) throw new Error("图片格式不支持");
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 320) {
      throw new Error("图片分辨率过低");
    }
    const processed = await source
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    const processedPath = `${input.uploaderId}/${input.postId}/${input.imageId}.webp`;
    const upload = await supabase.storage.from(ORIGINAL_BUCKET).upload(processedPath, processed, {
      contentType: "image/webp",
      upsert: true
    });
    if (upload.error) throw upload.error;

    return prisma.communityPostImage.update({
      where: { id: image.id },
      data: {
        status: "READY",
        processedObjectPath: processedPath,
        detectedMimeType: detectedMime,
        byteSize: bytes.length,
        width: metadata.width,
        height: metadata.height,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        validatedAt: new Date(),
        validationError: null
      }
    });
  } catch (error) {
    await prisma.communityPostImage.update({
      where: { id: image.id },
      data: { status: "FAILED", validationError: error instanceof Error ? error.message.slice(0, 300) : "图片校验失败" }
    });
    throw error;
  }
}
