import test from "node:test";
import assert from "node:assert/strict";
import { buddyMatchingTesting, type MatchableIntent } from "../server/buddy/matching";
import { EMPTY_USER_PROFILE } from "../server/recommendation/user-profile-v2";

function intent(overrides: Partial<MatchableIntent> = {}): MatchableIntent {
  const now = Date.now();
  return { id: "a", ownerId: "u1", routeSnapshotId: "r1", status: "ACTIVE", mode: "AUTO", departureStart: new Date(now + 3_600_000), departureEnd: new Date(now + 10_800_000), expiresAt: new Date(now + 3_600_000), meetingArea: "静安", createdAt: new Date(now - 3_600_000), preferences: { version: 1, hard: { meetingAreas: ["静安"] }, soft: { interests: ["展览", "咖啡"], moods: [] }, publicLabels: [] }, profile: EMPTY_USER_PROFILE, ...overrides };
}

test("auto matching requires the same route and overlapping time", () => {
  const a = intent();
  const b = intent({ id: "b", ownerId: "u2" });
  assert.equal(buddyMatchingTesting.isCompatibleCandidate(a, b), true);
  assert.equal(buddyMatchingTesting.isCompatibleCandidate(a, intent({ ownerId: "u2", routeSnapshotId: "r2" })), false);
  assert.equal(buddyMatchingTesting.isCompatibleCandidate(a, intent({ ownerId: "u2", departureStart: new Date(Date.now() + 20_000_000), departureEnd: new Date(Date.now() + 24_000_000) })), false);
});

test("shared preferences and area produce readable reasons", () => {
  const result = buddyMatchingTesting.scoreBuddyMatch(intent(), intent({ id: "b", ownerId: "u2" }));
  assert.ok(result.score > 40);
  assert.ok(result.reasons.some((reason) => reason.includes("展览") || reason.includes("集合")));
});
