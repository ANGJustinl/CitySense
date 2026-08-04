import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketPopularity,
  bucketPriceLevel,
  bucketQuietness,
  canonicalizeProfileArea,
  selectEffectiveInteractions
} from "@/server/recommendation/user-profile-v2";

test("profile buckets map venue attributes in the correct direction", () => {
  assert.equal(bucketPriceLevel(1), "low");
  assert.equal(bucketPriceLevel(2), "medium");
  assert.equal(bucketPriceLevel(3), "high");
  assert.equal(bucketQuietness(20), "lively");
  assert.equal(bucketQuietness(50), "balanced");
  assert.equal(bucketQuietness(80), "quiet");
  assert.equal(bucketPopularity(20), "low");
  assert.equal(bucketPopularity(80), "high");
});

test("area canonicalization matches district suffix variants", () => {
  assert.equal(canonicalizeProfileArea("静安区"), "静安");
  assert.equal(canonicalizeProfileArea(" 上海市 "), "上海");
});

test("latest route feedback replaces the previous route decision", () => {
  const base = {
    recommendationId: "rec-1",
    routeId: "route-1",
    itemId: "venue-1",
    feedbackId: null,
    signalKind: "route_feedback_item",
    weight: 1,
    context: {},
    createdAt: new Date("2026-07-01T10:00:00Z")
  };
  const selected = selectEffectiveInteractions([
    { ...base, id: "old", action: "up" },
    { ...base, id: "new", action: "down", weight: -1.5, createdAt: new Date("2026-07-01T11:00:00Z") }
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].action, "down");
});

test("explicit and import signals remain append-only", () => {
  const selected = selectEffectiveInteractions([
    {
      id: "explicit-1",
      recommendationId: null,
      routeId: null,
      itemId: null,
      action: "tag_approve",
      weight: 2,
      context: { tags: ["展览"] },
      createdAt: new Date("2026-07-01T10:00:00Z")
    },
    {
      id: "explicit-2",
      recommendationId: null,
      routeId: null,
      itemId: null,
      action: "tag_disapprove",
      weight: -2,
      context: { tags: ["展览"] },
      createdAt: new Date("2026-07-01T11:00:00Z")
    }
  ]);
  assert.equal(selected.length, 2);
});
