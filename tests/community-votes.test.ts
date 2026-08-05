import assert from "node:assert/strict";
import test from "node:test";
import { belongsToVenueRanking } from "@/server/community/votes";

test("venue rankings exclude zero and tied vote counts", () => {
  assert.equal(belongsToVenueRanking({ niche: 0, hot: 0 }, "HOT"), false);
  assert.equal(belongsToVenueRanking({ niche: 0, hot: 0 }, "NICHE"), false);
  assert.equal(belongsToVenueRanking({ niche: 3, hot: 3 }, "HOT"), false);
  assert.equal(belongsToVenueRanking({ niche: 3, hot: 3 }, "NICHE"), false);
});

test("venue belongs only to the ranking with a strict vote majority", () => {
  assert.equal(belongsToVenueRanking({ niche: 3, hot: 4 }, "HOT"), true);
  assert.equal(belongsToVenueRanking({ niche: 3, hot: 4 }, "NICHE"), false);
  assert.equal(belongsToVenueRanking({ niche: 4, hot: 3 }, "NICHE"), true);
  assert.equal(belongsToVenueRanking({ niche: 4, hot: 3 }, "HOT"), false);
});
