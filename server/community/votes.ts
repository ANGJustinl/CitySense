import { Prisma, type Venue } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { CommunityError } from "@/server/community/errors";
import { areaVariants } from "@/server/geo/area-normalizer";
import { venueRankingEntry } from "@/server/community/visibility";
import type { VenueVoteType } from "@/server/community/types";

const VOTE_FIELD: Record<VenueVoteType, "nicheVoteCount" | "hotVoteCount"> = {
  NICHE: "nicheVoteCount",
  HOT: "hotVoteCount"
};

export function belongsToVenueRanking(
  counts: { niche: number; hot: number },
  type: VenueVoteType
) {
  return type === "HOT" ? counts.hot > counts.niche : counts.niche > counts.hot;
}

function rankingEligibilityWhere(type: VenueVoteType): Prisma.VenueWhereInput {
  return type === "HOT"
    ? { hotVoteCount: { gt: prisma.venue.fields.nicheVoteCount } }
    : { nicheVoteCount: { gt: prisma.venue.fields.hotVoteCount } };
}

type RankingCursor = { voteCount: number; at: string; id: string };

function encodeRankingCursor(cursor: RankingCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeRankingCursor(value: string | null | undefined): RankingCursor | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new CommunityError("invalid_cursor", "翻页游标无效", 400);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).at !== "string" ||
    typeof (parsed as Record<string, unknown>).id !== "string" ||
    typeof (parsed as Record<string, unknown>).voteCount !== "number"
  ) {
    throw new CommunityError("invalid_cursor", "翻页游标无效", 400);
  }
  const cursor = parsed as RankingCursor;
  return { voteCount: cursor.voteCount, at: cursor.at, id: cursor.id };
}

function rankingOrderBy(type: VenueVoteType): Prisma.VenueOrderByWithRelationInput[] {
  const voteField = VOTE_FIELD[type];
  // 纯投票数排序；票数为 0 时按地点新建时间倒序兜底，让新发现的地点也有曝光
  return [{ [voteField]: "desc" }, { createdAt: "desc" }, { id: "desc" }];
}

function rankingCursorWhere(cursor: RankingCursor | undefined, type: VenueVoteType): Prisma.VenueWhereInput {
  if (!cursor) return {};
  const voteField = VOTE_FIELD[type];
  const at = new Date(cursor.at);
  // 游标按 (voteCount desc, createdAt desc, id desc) 推进：取当前游标三元组之后的行
  const tieBreaker: Prisma.VenueWhereInput = {
    OR: [{ createdAt: { lt: at } }, { AND: [{ createdAt: at }, { id: { lt: cursor.id } }] }]
  };
  return {
    OR: [
      { [voteField]: { lt: cursor.voteCount } },
      { AND: [{ [voteField]: cursor.voteCount }, tieBreaker] }
    ]
  };
}

async function publishedVenue(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, publicationStatus: "PUBLISHED" },
    select: { id: true }
  });
  if (!venue) throw new CommunityError("venue_not_found", "地点不存在或已下架", 404);
  return venue;
}

export async function listVenueRanking(input: {
  city: string;
  type: VenueVoteType;
  area?: string;
  cursor?: string;
  limit: number;
  viewerId?: string;
}) {
  const cursor = decodeRankingCursor(input.cursor);
  const variants = areaVariants(input.area);
  const where: Prisma.VenueWhereInput = {
    publicationStatus: "PUBLISHED",
    city: input.city,
    ...(variants.length ? { area: { in: variants } } : {}),
    AND: [rankingEligibilityWhere(input.type), rankingCursorWhere(cursor, input.type)]
  };
  const venues = await prisma.venue.findMany({
    where,
    orderBy: rankingOrderBy(input.type),
    take: input.limit + 1,
    include: input.viewerId
      ? { venueVotes: { where: { userId: input.viewerId }, select: { type: true } } }
      : undefined
  });
  const hasMore = venues.length > input.limit;
  const items = venues.slice(0, input.limit);
  const last = items.at(-1);
  const voteField = VOTE_FIELD[input.type];
  return {
    entries: items.map((venue) => venueRankingEntry(venue as Venue & { venueVotes?: { type: VenueVoteType }[] }, input.viewerId)),
    nextCursor:
      hasMore && last
        ? encodeRankingCursor({
            voteCount: last[voteField],
            at: last.createdAt.toISOString(),
            id: last.id
          })
        : null
  };
}

export async function setVenueVote(userId: string, venueId: string, type: VenueVoteType) {
  await publishedVenue(venueId);
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.venueVote.findUnique({
        where: { venueId_userId: { venueId, userId } },
        select: { type: true }
      });
      if (existing?.type !== type) {
        if (existing) {
          // 切换类型：旧计数 -1，新计数 +1
          await tx.venueVote.update({ where: { venueId_userId: { venueId, userId } }, data: { type } });
          await tx.venue.update({ where: { id: venueId }, data: { [VOTE_FIELD[existing.type]]: { decrement: 1 } } });
        } else {
          await tx.venueVote.create({ data: { venueId, userId, type } });
        }
        await tx.venue.update({ where: { id: venueId }, data: { [VOTE_FIELD[type]]: { increment: 1 } } });
      }
      // 同类型重复投票：幂等，不改动计数
      const counts = await tx.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { nicheVoteCount: true, hotVoteCount: true }
      });
      return { votedType: type, counts: { niche: counts.nicheVoteCount, hot: counts.hotVoteCount } };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function removeVenueVote(userId: string, venueId: string) {
  await publishedVenue(venueId);
  return prisma.$transaction(
    async (tx) => {
      const removed = await tx.venueVote.deleteMany({ where: { venueId, userId } });
      if (removed.count) {
        // 以实际剩余行重算两个计数，删除时无需依赖被删行的旧类型
        const remaining = await tx.venueVote.groupBy({
          by: ["type"],
          where: { venueId },
          _count: { type: true }
        });
        const niche = remaining.find((row) => row.type === "NICHE")?._count.type ?? 0;
        const hot = remaining.find((row) => row.type === "HOT")?._count.type ?? 0;
        await tx.venue.update({ where: { id: venueId }, data: { nicheVoteCount: niche, hotVoteCount: hot } });
      }
      const counts = await tx.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { nicheVoteCount: true, hotVoteCount: true }
      });
      return { votedType: null, counts: { niche: counts.nicheVoteCount, hot: counts.hotVoteCount } };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
