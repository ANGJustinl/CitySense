import { createHash } from "node:crypto";
import { Prisma, type Venue, type VenueSubmission } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { distanceMeters } from "@/server/maps/traffic";
import { geocodeAddress } from "@/server/maps/geocode";
import { getAmapPlaceById } from "@/server/maps/amap-place-search";
import { createSupabaseAdminClient } from "@/server/storage/supabase-admin";
import { recordSystemAction } from "@/server/submissions/service";

const ORIGINAL_BUCKET = process.env.CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals";
const VENUE_BUCKET = process.env.CITYSENSE_VENUE_IMAGE_BUCKET ?? "venue-images";

function normalized(value: string) {
  return value.normalize("NFKC").replace(/[^\p{Script=Han}a-z0-9]/giu, "").toLowerCase();
}

async function findDuplicate(submission: VenueSubmission, lat: number, lng: number): Promise<Venue | null> {
  const nearby = await prisma.venue.findMany({
    where: {
      city: submission.city,
      lat: { gte: lat - 0.003, lte: lat + 0.003 },
      lng: { gte: lng - 0.003, lte: lng + 0.003 }
    },
    take: 30
  });
  const targetName = normalized(submission.name);
  return nearby.find((venue) => {
    if (!venue.lat || !venue.lng) return false;
    const sameName = normalized(venue.name) === targetName || normalized(venue.name).includes(targetName) || targetName.includes(normalized(venue.name));
    return sameName && distanceMeters({ lat, lng }, { lat: venue.lat, lng: venue.lng }) <= 120;
  }) ?? null;
}

async function publishImages(submissionId: string, venueId: string) {
  const images = await prisma.submissionImage.findMany({ where: { submissionId, status: "SAFE" } });
  const supabase = createSupabaseAdminClient();
  const published = [];
  for (let index = 0; index < images.length; index += 1) {
    const sourcePath = images[index].processedObjectPath;
    if (!sourcePath) continue;
    const download = await supabase.storage.from(ORIGINAL_BUCKET).download(sourcePath);
    if (download.error) throw download.error;
    const bytes = Buffer.from(await download.data.arrayBuffer());
    const objectPath = `${venueId}/${createHash("sha256").update(bytes).digest("hex")}.webp`;
    const upload = await supabase.storage.from(VENUE_BUCKET).upload(objectPath, bytes, { contentType: "image/webp", upsert: true });
    if (upload.error) throw upload.error;
    const publicUrl = supabase.storage.from(VENUE_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    published.push(await prisma.venueImage.upsert({
      where: { objectPath },
      create: {
        venueId,
        submissionId,
        objectPath,
        publicUrl,
        width: images[index].width ?? 1,
        height: images[index].height ?? 1,
        isPrimary: index === 0
      },
      update: { published: true }
    }));
  }
  return published;
}

export async function processSubmission(submissionId: string) {
  const claimed = await prisma.venueSubmission.updateMany({
    where: { id: submissionId, status: "SUBMITTED" },
    data: { status: "PROCESSING", processingStartedAt: new Date(), processingLeaseUntil: new Date(Date.now() + 10 * 60_000) }
  });
  if (claimed.count === 0) return null;
  const submission = await prisma.venueSubmission.findUnique({ where: { id: submissionId }, include: { images: true } });
  if (!submission) return null;

  try {
    if (submission.images.filter((image) => image.status === "SAFE").length === 0) {
      throw new Error("At least one validated image is required");
    }
    const amap = submission.selectedAmapPoiId
      ? await getAmapPlaceById(submission.selectedAmapPoiId, submission.city)
      : null;
    const geocode = amap?.lat && amap.lng
      ? { address: amap.address ?? submission.address, lat: amap.lat, lng: amap.lng }
      : await geocodeAddress(`${submission.name} ${submission.address}`, submission.city);
    if (!geocode) {
      return prisma.venueSubmission.update({
        where: { id: submission.id },
        data: { status: "NEEDS_REVIEW", matchType: "AMBIGUOUS", technicalFlags: ["geocode_failed"], publicStatusMessage: "地址无法自动解析，请编辑地址后重试" }
      });
    }
    const pinDistance = submission.userLat && submission.userLng
      ? distanceMeters({ lat: submission.userLat, lng: submission.userLng }, { lat: geocode.lat, lng: geocode.lng })
      : 0;
    if (pinDistance > 500) {
      return prisma.venueSubmission.update({
        where: { id: submission.id },
        data: { status: "NEEDS_REVIEW", matchType: "AMBIGUOUS", technicalFlags: ["pin_address_conflict"], verifiedAddress: geocode.address, verifiedLat: geocode.lat, verifiedLng: geocode.lng, publicStatusMessage: "地图位置和地址不一致，请确认后重试" }
      });
    }
    const duplicate = await findDuplicate(submission, geocode.lat, geocode.lng);
    if (duplicate?.publicationStatus === "REMOVED") {
      return prisma.venueSubmission.update({ where: { id: submission.id }, data: { status: "NEEDS_REVIEW", matchType: "EXISTING_EXACT", matchedVenueId: duplicate.id, technicalFlags: ["removed_venue_match"] } });
    }
    if (duplicate) {
      const updated = await prisma.venueSubmission.update({
        where: { id: submission.id },
        data: { status: "AUTO_PUBLISHED", matchType: "EXISTING_EXACT", matchedVenueId: duplicate.id, resultingVenueId: duplicate.id, verifiedAddress: geocode.address, verifiedLat: geocode.lat, verifiedLng: geocode.lng, publishedAt: new Date(), publicStatusMessage: "已自动关联到现有地点" }
      });
      await publishImages(submission.id, duplicate.id);
      await recordSystemAction({ submissionId, action: "AUTO_LINK_EXISTING", fromStatus: "PROCESSING", toStatus: "AUTO_PUBLISHED" });
      return updated;
    }
    const venue = await prisma.$transaction(async (tx) => {
      const created = await tx.venue.create({
        data: {
          sourceKey: `ugc:${submission.id}`,
          createdFromSubmissionId: submission.id,
          name: submission.name,
          description: submission.description,
          city: submission.city,
          area: submission.area,
          address: geocode.address,
          lat: geocode.lat,
          lng: geocode.lng,
          tags: submission.tags,
          source: "user-submission",
          trendScore: 35,
          confidence: amap ? 75 : 58,
          qualityScore: 70,
          qualityFlags: amap ? [] : ["user_submitted_novel"],
          publicationStatus: "PUBLISHED",
          publishedAt: new Date()
        }
      });
      await tx.venueSubmission.update({
        where: { id: submission.id },
        data: { status: "AUTO_PUBLISHED", matchType: amap ? "AMAP_EXACT" : "NOVEL", resultingVenueId: created.id, verifiedAddress: geocode.address, verifiedLat: geocode.lat, verifiedLng: geocode.lng, publishedAt: new Date(), publicStatusMessage: "已发布到 CitySense" }
      });
      return created;
    });
    const images = await publishImages(submission.id, venue.id);
    if (images[0]) await prisma.venue.update({ where: { id: venue.id }, data: { imageUrl: images[0].publicUrl, imageSource: "user-submission" } });
    await recordSystemAction({ submissionId, action: "AUTO_PUBLISH", fromStatus: "PROCESSING", toStatus: "AUTO_PUBLISHED", metadata: { venueId: venue.id } });
    return prisma.venueSubmission.findUnique({ where: { id: submission.id } });
  } catch (error) {
    const updated = await prisma.venueSubmission.update({
      where: { id: submission.id },
      data: { status: "NEEDS_REVIEW", technicalFlags: ["processing_failed"], publicStatusMessage: "自动处理失败，可以重试", automatedResult: { error: error instanceof Error ? error.message.slice(0, 300) : "processing failed" } as Prisma.InputJsonValue }
    });
    await recordSystemAction({ submissionId, action: "PROCESSING_FAILED", fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW" });
    return updated;
  }
}
