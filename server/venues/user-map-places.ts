import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { areaVariants } from "@/server/geo/area-normalizer";
import { publishedVenueWhere } from "@/server/venues/publication";

const coordinate = z.coerce.number().finite();

export const userMapVenueQuerySchema = z.object({
  city: z.string().trim().min(1).max(40),
  area: z.string().trim().max(40).optional(),
  west: coordinate.min(-180).max(180).optional(),
  south: coordinate.min(-90).max(90).optional(),
  east: coordinate.min(-180).max(180).optional(),
  north: coordinate.min(-90).max(90).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60)
}).strict().superRefine((value, context) => {
  const bounds = [value.west, value.south, value.east, value.north];
  const provided = bounds.filter((item) => item !== undefined).length;
  if (provided !== 0 && provided !== 4) {
    context.addIssue({ code: "custom", message: "地图范围参数必须完整" });
    return;
  }
  if (provided === 4) {
    if ((value.west as number) >= (value.east as number) || (value.south as number) >= (value.north as number)) {
      context.addIssue({ code: "custom", message: "地图范围无效" });
    }
    if ((value.east as number) - (value.west as number) > 3 || (value.north as number) - (value.south as number) > 3) {
      context.addIssue({ code: "custom", message: "地图范围过大" });
    }
  }
});

export type UserMapVenueQuery = z.infer<typeof userMapVenueQuerySchema>;

export type UserMapVenuePoint = {
  id: string;
  name: string;
  address?: string;
  area?: string;
  tags: string[];
  imageUrl?: string;
  lat: number;
  lng: number;
};

export function buildUserMapVenueWhere(input: UserMapVenueQuery) {
  const areas = areaVariants(input.area);
  const hasBounds = input.west !== undefined;
  return {
    ...publishedVenueWhere(),
    source: "user-submission",
    createdFromSubmissionId: { not: null },
    city: input.city,
    ...(areas.length > 0 ? { area: { in: areas } } : {}),
    lat: hasBounds ? { not: null, gte: input.south, lte: input.north } : { not: null },
    lng: hasBounds ? { not: null, gte: input.west, lte: input.east } : { not: null }
  };
}

function publicImageUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function listUserMapVenues(input: UserMapVenueQuery) {
  const rows = await prisma.venue.findMany({
    where: buildUserMapVenueWhere(input),
    select: { id: true, name: true, address: true, area: true, tags: true, imageUrl: true, lat: true, lng: true },
    orderBy: [{ publishedAt: "desc" }, { qualityScore: "desc" }, { createdAt: "desc" }],
    take: input.limit + 1
  });
  const truncated = rows.length > input.limit;
  const points: UserMapVenuePoint[] = rows.slice(0, input.limit).flatMap((row) => {
    if (row.lat === null || row.lng === null || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return [];
    return [{
      id: row.id,
      name: row.name,
      address: row.address ?? undefined,
      area: row.area ?? undefined,
      tags: row.tags.slice(0, 6).map((tag) => tag.slice(0, 40)),
      imageUrl: publicImageUrl(row.imageUrl),
      lat: Number(row.lat.toFixed(6)),
      lng: Number(row.lng.toFixed(6))
    }];
  });
  return { points, pointCount: points.length, truncated, generatedAt: new Date().toISOString() };
}
