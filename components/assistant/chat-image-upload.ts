"use client";

/**
 * AI 助手聊天图前端上传逻辑。
 *
 * 与 submission-image-upload.ts 的三段式不同,聊天图直传 /api/chat/images(multipart),
 * 服务端一次性完成校验+转码+入库,返回 { id, url, ... }。
 *
 * uploadChatImage 返回的 chatImageId 既能作为视觉对话的 image_url,
 * 也可在第 3 层随确认动作绑定到 post/submission。
 */
import { readJsonResponse } from "@/lib/http-response";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const MAX_CHAT_IMAGES = 5;
export const MAX_CHAT_IMAGE_BYTES = 10_485_760;
export const CHAT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ChatImageValidation = { valid: File[]; errors: string[] };

export type UploadedChatImage = {
  id: string;
  url: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
};

/** 通用校验:支持自定义上限(聊天 5 张 / 手记 9 张)。 */
export function validateImages(files: File[], existingCount: number, max: number): ChatImageValidation {
  const valid: File[] = [];
  const errors: string[] = [];
  const remaining = Math.max(0, max - existingCount);

  for (const file of files) {
    if (valid.length >= remaining) {
      errors.push(`最多上传 ${max} 张照片`);
      break;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      errors.push(`${file.name} 格式不支持，仅支持 JPEG、PNG 和 WebP`);
      continue;
    }
    if (file.size > MAX_CHAT_IMAGE_BYTES) {
      errors.push(`${file.name} 超过 10 MB，请压缩后重试`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors: [...new Set(errors)] };
}

export function validateChatImages(files: File[], existingCount = 0): ChatImageValidation {
  return validateImages(files, existingCount, MAX_CHAT_IMAGES);
}

/** 社区手记图片上限(env 默认 9)。 */
export const MAX_POST_IMAGES = 9;
export function validatePostImages(files: File[], existingCount = 0): ChatImageValidation {
  return validateImages(files, existingCount, MAX_POST_IMAGES);
}

export async function uploadChatImage(file: File): Promise<UploadedChatImage> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/chat/images", { method: "POST", body: form });
  return readJsonResponse<UploadedChatImage>(response, "图片上传失败");
}

/**
 * 为社区手记上传图片(三段式:reserve → Supabase 签名 URL → complete)。
 * 镜像 uploadSubmissionImage,但走 /api/community/posts/[id]/images/* 端点。
 */
export async function uploadPostImage(postId: string, file: File) {
  const reserve = await fetch(`/api/community/posts/${postId}/images/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType: file.type })
  });
  const slot = await readJsonResponse<{ path: string; token: string; image: { id: string } }>(reserve, "图片上传准备失败");
  const supabase = createSupabaseBrowserClient();
  const uploaded = await supabase.storage
    .from(process.env.NEXT_PUBLIC_CITYSENSE_COMMUNITY_IMAGE_BUCKET ?? "community-images")
    .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
  if (uploaded.error) throw uploaded.error;
  const complete = await fetch(`/api/community/posts/${postId}/images/${slot.image.id}/complete`, { method: "POST" });
  await readJsonResponse(complete, "图片校验失败");
}
