import { prisma } from "@/server/db/prisma";

export type VenueSearchHit = {
  id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
};

/**
 * 搜索本库中已发布的地点，供城市手记等场景关联使用。
 *
 * 用 ILIKE 做名称模糊匹配（contains），按名称完全包含优先、再按创建时间倒序。
 * 仅返回 PUBLISHED 地点，避免选到已下架的。
 */
export async function searchPublishedVenues(input: {
  query: string;
  city?: string;
  limit?: number;
}): Promise<VenueSearchHit[]> {
  const query = input.query.trim();
  if (query.length < 1) return [];
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const venues = await prisma.venue.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      name: { contains: query, mode: "insensitive" },
      ...(input.city ? { city: input.city } : {})
    },
    select: { id: true, name: true, city: true, area: true, address: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    city: venue.city,
    area: venue.area,
    address: venue.address
  }));
}
