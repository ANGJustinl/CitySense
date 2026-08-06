"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readJsonResponse } from "@/lib/http-response";

export const MAX_SUBMISSION_IMAGES = 5;
export const MAX_SUBMISSION_IMAGE_BYTES = 10_485_760;
export const SUBMISSION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type SubmissionImageValidation = { valid: File[]; errors: string[] };

export function validateSubmissionImages(files: File[], existingCount = 0): SubmissionImageValidation {
  const valid: File[] = [];
  const errors: string[] = [];
  const remaining = Math.max(0, MAX_SUBMISSION_IMAGES - existingCount);

  for (const file of files) {
    if (valid.length >= remaining) {
      errors.push(`最多上传 ${MAX_SUBMISSION_IMAGES} 张照片`);
      break;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      errors.push(`${file.name} 格式不支持，仅支持 JPEG、PNG 和 WebP`);
      continue;
    }
    if (file.size > MAX_SUBMISSION_IMAGE_BYTES) {
      errors.push(`${file.name} 超过 10 MB，请压缩后重试`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors: [...new Set(errors)] };
}

export async function uploadSubmissionImage(submissionId: string, file: File) {
  const reserve = await fetch(`/api/place-submissions/${submissionId}/images/reserve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType: file.type })
  });
  const slot = await readJsonResponse<{ path: string; token: string; image: { id: string } }>(reserve, "图片上传准备失败");
  const supabase = createSupabaseBrowserClient();
  const uploaded = await supabase.storage
    .from(process.env.NEXT_PUBLIC_CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals")
    .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
  if (uploaded.error) throw uploaded.error;
  const complete = await fetch(`/api/place-submissions/${submissionId}/images/${slot.image.id}/complete`, { method: "POST" });
  await readJsonResponse(complete, "图片校验失败");
}
