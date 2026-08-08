import { createHash } from "node:crypto";
import sharp from "sharp";
import { Prisma, type SubmissionImageStatus, type VenueSubmissionStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/storage/supabase-admin";

const ORIGINAL_BUCKET = process.env.CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals";
const MAX_IMAGES = Number(process.env.CITYSENSE_SUBMISSION_MAX_IMAGES ?? 5);
const MAX_BYTES = Number(process.env.CITYSENSE_SUBMISSION_MAX_IMAGE_BYTES ?? 10_485_760);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const RESERVATION_MAX_AGE_MS = 60 * 60 * 1000;

export type SubmissionImageErrorCode =
  | "invalid_image_request"
  | "submission_not_editable"
  | "image_limit_reached"
  | "storage_not_configured"
  | "storage_unavailable"
  | "image_not_found"
  | "image_validation_failed";

export class SubmissionImageError extends Error {
  constructor(
    readonly code: SubmissionImageErrorCode,
    readonly status: number,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "SubmissionImageError";
  }
}

export function describeSubmissionImageError(error: unknown) {
  if (error instanceof SubmissionImageError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  const cause = error as { name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown };
  return {
    code: "internal_error",
    status: 500,
    message: error instanceof Error ? error.message : "Unknown error",
    cause: {
      name: typeof cause.name === "string" ? cause.name : undefined,
      message: typeof cause.message === "string" ? cause.message.slice(0, 240) : undefined,
      status: typeof cause.status === "number" ? cause.status : undefined,
      statusCode: typeof cause.statusCode === "number" ? cause.statusCode : undefined,
      code: typeof cause.code === "string" ? cause.code : undefined
    }
  };
}

function storageError(error: unknown, message = "图片存储服务暂时不可用，请稍后重试") {
  return new SubmissionImageError("storage_unavailable", 503, message, { cause: error });
}

function isActiveReservation(image: { status: SubmissionImageStatus; createdAt: Date }) {
  return image.status !== "FAILED" && image.status !== "DELETED"
    && (image.status !== "RESERVED" || Date.now() - image.createdAt.getTime() < RESERVATION_MAX_AGE_MS);
}

export async function reserveSubmissionImage(input: {
  submissionId: string;
  submitterId: string;
  mimeType: string;
}) {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new SubmissionImageError("invalid_image_request", 400, "Only JPEG, PNG and WebP are supported");
  }
  const submission = await prisma.venueSubmission.findFirst({
    where: { id: input.submissionId, submitterId: input.submitterId, status: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
    include: { images: { where: { status: { not: "DELETED" } } } }
  });
  if (!submission) throw new SubmissionImageError("submission_not_editable", 404, "Submission not found or not editable");
  const activeImages = submission.images.filter(isActiveReservation);
  if (activeImages.length >= MAX_IMAGES) throw new SubmissionImageError("image_limit_reached", 409, "Image limit reached");

  const imageId = crypto.randomUUID();
  const path = `${input.submitterId}/${input.submissionId}/${imageId}`;
  const image = await prisma.submissionImage.create({
    data: { id: imageId, submissionId: input.submissionId, originalObjectPath: path, declaredMimeType: input.mimeType }
  });

  try {
    const supabase = createSupabaseAdminClient();
    const token = await supabase.storage.from(ORIGINAL_BUCKET).createSignedUploadUrl(path);
    if (token.error) throw storageError(token.error);
    if (!token.data?.token) throw storageError(new Error("Supabase returned no signed upload token"));
    return { image, path, token: token.data.token };
  } catch (error) {
    try {
      await prisma.submissionImage.delete({ where: { id: image.id } });
    } catch (rollbackError) {
      console.error("submission image reserve rollback failed", {
        submissionId: input.submissionId,
        imageId: image.id,
        error: describeSubmissionImageError(rollbackError)
      });
    }
    throw error;
  }
}

export async function cancelSubmissionImage(input: { submissionId: string; imageId: string; submitterId: string }) {
  const image = await prisma.submissionImage.findFirst({
    where: { id: input.imageId, submissionId: input.submissionId, submission: { submitterId: input.submitterId } }
  });
  if (!image) return null;
  if (image.status === "DELETED") return image;
  if (image.status === "SAFE") throw new SubmissionImageError("image_validation_failed", 409, "Image is already attached");
  const supabase = createSupabaseAdminClient();
  await supabase.storage.from(ORIGINAL_BUCKET).remove([image.originalObjectPath]).catch(() => undefined);
  return prisma.submissionImage.update({ where: { id: image.id }, data: { status: "DELETED" } });
}

export async function completeSubmissionImage(input: {
  submissionId: string;
  imageId: string;
  submitterId: string;
}) {
  const image = await prisma.submissionImage.findFirst({
    where: { id: input.imageId, submissionId: input.submissionId, submission: { submitterId: input.submitterId } }
  });
  if (!image) throw new SubmissionImageError("image_not_found", 404, "Image not found");
  if (image.status === "SAFE") return image;
  if (image.status !== "RESERVED" && image.status !== "UPLOADED") {
    throw new SubmissionImageError("image_validation_failed", 409, "Image is not ready for validation");
  }
  const validating = await prisma.submissionImage.updateMany({
    where: { id: image.id, status: { in: ["RESERVED", "UPLOADED"] } },
    data: { status: "VALIDATING" }
  });
  if (validating.count === 0) return prisma.submissionImage.findUniqueOrThrow({ where: { id: image.id } });

  let processedPath: string | undefined;
  try {
    const supabase = createSupabaseAdminClient();
    const downloaded = await supabase.storage.from(ORIGINAL_BUCKET).download(image.originalObjectPath);
    if (downloaded.error || !downloaded.data) throw storageError(downloaded.error ?? new Error("Image download failed"));
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error("Image is too large");
    const source = sharp(bytes, { animated: false, limitInputPixels: 30_000_000 });
    const metadata = await source.metadata();
    const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : undefined;
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) throw new Error("Unsupported image format");
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 320) throw new Error("Image resolution is too small");
    const processed = await source.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    processedPath = `${input.submitterId}/${input.submissionId}/${input.imageId}.webp`;
    const upload = await supabase.storage.from(ORIGINAL_BUCKET).upload(processedPath, processed, { contentType: "image/webp", upsert: true });
    if (upload.error) throw upload.error;
    return prisma.submissionImage.update({
      where: { id: image.id },
      data: { status: "SAFE", processedObjectPath: processedPath, detectedMimeType: detectedMime, byteSize: bytes.length, width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(bytes).digest("hex"), validatedAt: new Date(), validationError: null }
    });
  } catch (error) {
    if (processedPath) {
      try { const supabase = createSupabaseAdminClient(); await supabase.storage.from(ORIGINAL_BUCKET).remove([processedPath]); } catch { /* best effort */ }
    }
    await prisma.submissionImage.update({ where: { id: image.id }, data: { status: "FAILED", validationError: error instanceof Error ? error.message.slice(0, 300) : "Image validation failed" } });
    if (error instanceof SubmissionImageError) throw error;
    throw new SubmissionImageError("image_validation_failed", 400, error instanceof Error ? error.message : "Image validation failed", { cause: error });
  }
}

export async function recordSystemAction(input: { submissionId: string; action: string; fromStatus?: VenueSubmissionStatus; toStatus: VenueSubmissionStatus; reasonCode?: string; metadata?: unknown }) {
  return prisma.submissionModerationAction.create({
    data: { submissionId: input.submissionId, actorType: "SYSTEM", action: input.action, fromStatus: input.fromStatus, toStatus: input.toStatus, reasonCode: input.reasonCode, metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue : undefined }
  });
}
