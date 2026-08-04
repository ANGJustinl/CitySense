import { Prisma, VenuePublicationStatus } from "@prisma/client";

export const PUBLIC_VENUE_STATUS = VenuePublicationStatus.PUBLISHED;

export function publishedVenueWhere(): Prisma.VenueWhereInput {
  return { publicationStatus: PUBLIC_VENUE_STATUS };
}

export function publishedVenueSql(alias?: string) {
  const column = alias
    ? Prisma.raw(`"${alias}"."publicationStatus"`)
    : Prisma.raw('"publicationStatus"');
  return Prisma.sql`${column} = 'PUBLISHED'::"VenuePublicationStatus"`;
}

export function isVenuePublished(value: { publicationStatus: VenuePublicationStatus }) {
  return value.publicationStatus === VenuePublicationStatus.PUBLISHED;
}
