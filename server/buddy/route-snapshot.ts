import type { Prisma } from "@prisma/client";
import { getRouteDetailRecord, parseRouteSnapshotId } from "@/server/routes/route-detail";
import { BuddyError } from "@/server/buddy/errors";

export type BuddyRouteSnapshot = {
  version: 1;
  id: string;
  title: string;
  summary: string;
  city: string;
  area?: string;
  durationMinutes: number;
  stops: Array<{ id: string; name: string; area?: string; tags: string[] }>;
};

export function buildBuddyRouteSnapshot(detail: NonNullable<Awaited<ReturnType<typeof getRouteDetailRecord>>>) {
  const city = detail.recommendation.input.city;
  const area = detail.recommendation.input.area ?? detail.route.places.find((place) => place.area)?.area;
  const durationMinutes = detail.route.traffic.estimatedDurationMinutes ?? detail.route.legs?.reduce((sum, leg) => sum + (leg.durationMinutes ?? 0), 0) ?? 0;
  return {
    version: 1 as const,
    id: detail.route.id,
    title: detail.route.title,
    summary: detail.route.summary,
    city,
    ...(area ? { area } : {}),
    durationMinutes,
    stops: detail.route.places.map((place) => ({
      id: place.id,
      name: place.name,
      ...(place.area ? { area: place.area } : {}),
      tags: place.tags.slice(0, 8),
    })),
  } satisfies BuddyRouteSnapshot;
}

export async function resolveBuddyRouteSnapshot(routeSnapshotId: string, ownerUserId?: string) {
  const parsed = parseRouteSnapshotId(routeSnapshotId);
  if (!parsed) throw new BuddyError("invalid_route", "路线 ID 无效", 400);
  const detail = await getRouteDetailRecord(routeSnapshotId);
  if (!detail) throw new BuddyError("route_not_found", "路线不存在", 404);
  if (ownerUserId && detail.recommendation.ownerUserId !== ownerUserId) {
    throw new BuddyError("route_not_owned", "请登录后重新生成一条属于你的路线", 403);
  }
  const snapshot = buildBuddyRouteSnapshot(detail);
  return { parsed, detail, snapshot, json: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue };
}
