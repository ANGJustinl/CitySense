import assert from "node:assert/strict";
import test from "node:test";
import { isVenuePublished, publishedVenueWhere } from "@/server/venues/publication";

test("publication gate only exposes published venues", () => {
  assert.equal(isVenuePublished({ publicationStatus: "PUBLISHED" }), true);
  assert.equal(isVenuePublished({ publicationStatus: "UNLISTED" }), false);
  assert.equal(isVenuePublished({ publicationStatus: "REMOVED" }), false);
  assert.deepEqual(publishedVenueWhere(), { publicationStatus: "PUBLISHED" });
});
