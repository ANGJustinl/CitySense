import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/storage/supabase-admin";

const ORIGINAL_BUCKET = process.env.CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals";
const MAX_IMAGES = Number(process.env.CITYSENSE_SUBMISSION_MAX_IMAGES ?? 5);
const MAX_BYTES = Number(process.env.CITYSENSE_SUBMISSION_MAX_IMAGE_BYTES ?? 10_485_760);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function reserveSubmissionImage(input: {
  submissionId: string;
  submitterId: string;
  mimeType: string;
}) {
  if (!ALLOWED_MIME.has(input.mimeType)) throw new Error("Only JPEG, PNG and WebP are supported");
  const submission = await prisma.venueSubmission.findFirst({
    where: { id: input.submissionId, submitterId: input.submitterId, status: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
    include: { images: { where: { status: { not: "DELETED" } } } }
  });
  if (!submission) throw new Error("Submission not found or not editable");
  if (submission.images.length >= MAX_IMAGES) throw new Error("Image limit reached");
  const imageId = crypto.randomUUID();
  const path = `${input.submitterId}/${input.submissionId}/${imageId}`;
  const supabase = createSupabaseAdminClient();
  const token = await supabase.storage.from(ORIGINAL_BUCKET).createSignedUploadUrl(path);
  if (token.error) throw token.error;
  const image = await prisma.submissionImage.create({
    data: {
      id: imageId,
      submissionId: input.submissionId,
      originalObjectPath: path,
      declaredMimeType: input.mimeType
    }
  });
  return { image, path, token: token.data.token };
}

export async function completeSubmissionImage(input: {
  submissionId: string;
  imageId: string;
  submitterId: string;
}) {
  const image = await prisma.submissionImage.findFirst({
    where: { id: input.imageId, submissionId: input.submissionId, submission: { submitterId: input.submitterId } }
  });
  if (!image) throw new Error("Image not found");
  const supabase = createSupabaseAdminClient();
  const downloaded = await supabase.storage.from(ORIGINAL_BUCKET).download(image.originalObjectPath);
  if (downloaded.error) throw downloaded.error;
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Image is too large");
  try {
    const source = sharp(bytes, { animated: false, limitInputPixels: 30_000_000 });
    const metadata = await source.metadata();
    const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : undefined;
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) throw new Error("Unsupported image format");
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 320) throw new Error("Image resolution is too small");
    const processed = await source.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const processedPath = `${input.submitterId}/${input.submissionId}/${input.imageId}.webp`;
    const upload = await supabase.storage.from(ORIGINAL_BUCKET).upload(processedPath, processed, {
      contentType: "image/webp",
      upsert: true
    });
    if (upload.error) throw upload.error;
    return prisma.submissionImage.update({
      where: { id: image.id },
      data: {
        status: "SAFE",
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
    await prisma.submissionImage.update({
      where: { id: image.id },
      data: { status: "FAILED", validationError: error instanceof Error ? error.message.slice(0, 300) : "Image validation failed" }
    });
    throw error;
  }
}
