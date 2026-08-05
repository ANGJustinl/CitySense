import assert from "node:assert/strict";
import test from "node:test";
import { buildUserMapVenueWhere, userMapVenueQuerySchema } from "@/server/venues/user-map-places";

test("user map venues require published user-created venues with coordinates", () => {
  const where = buildUserMapVenueWhere(userMapVenueQuerySchema.parse({ city: "上海" }));
  assert.equal(where.publicationStatus, "PUBLISHED");
  assert.equal(where.source, "user-submission");
  assert.deepEqual(where.createdFromSubmissionId, { not: null });
  assert.deepEqual(where.lat, { not: null });
  assert.deepEqual(where.lng, { not: null });
});

test("user map venues apply area variants and bounds", () => {
  const where = buildUserMapVenueWhere(userMapVenueQuerySchema.parse({
    city: "上海", area: "静安", west: "121.4", south: "31.1", east: "121.6", north: "31.4"
  }));
  assert.deepEqual(where.area, { in: ["静安", "静安区"] });
  assert.deepEqual(where.lng, { not: null, gte: 121.4, lte: 121.6 });
  assert.deepEqual(where.lat, { not: null, gte: 31.1, lte: 31.4 });
});

test("user map venue query rejects incomplete and oversized bounds", () => {
  assert.equal(userMapVenueQuerySchema.safeParse({ city: "上海", west: 121 }).success, false);
  assert.equal(userMapVenueQuerySchema.safeParse({ city: "上海", west: 100, south: 20, east: 110, north: 30 }).success, false);
});
