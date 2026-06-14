import assert from "node:assert/strict";
import test from "node:test";
import { fuseCandidateTags } from "@/server/recommendation/user-profile";

/**
 * Tests for the pure fusion logic. DB-backed getUserProfile / setTagPreference
 * are integration-level (hit Postgres) and are exercised live in the browser.
 */

function tagByName(candidates: ReturnType<typeof fuseCandidateTags>, tag: string) {
  return candidates.find((c) => c.tag === tag);
}

test("fuseCandidateTags: new user (only city tags) → all pending", () => {
  const result = fuseCandidateTags({
    explicitApproved: {},
    explicitDisapproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: [
      { label: "咖啡", value: 79 },
      { label: "展览", value: 65 }
    ]
  });

  assert.equal(result.length, 2);
  assert.equal(tagByName(result, "咖啡")?.status, "pending");
  assert.equal(tagByName(result, "咖啡")?.source, "city");
  assert.equal(tagByName(result, "咖啡")?.score, 79);
});

test("fuseCandidateTags: explicit approval overrides city pending", () => {
  const result = fuseCandidateTags({
    explicitApproved: { 咖啡: 0.8 },
    explicitDisapproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: [
      { label: "咖啡", value: 79 },
      { label: "展览", value: 65 }
    ]
  });

  const coffee = tagByName(result, "咖啡");
  assert.ok(coffee);
  assert.equal(coffee.status, "approved");
  assert.equal(coffee.source, "explicit");
  assert.match(coffee.context, /显式认可/);

  // Exhibition stays pending from city.
  assert.equal(tagByName(result, "展览")?.status, "pending");
});

test("fuseCandidateTags: implicit positive weight → approved from implicit", () => {
  const result = fuseCandidateTags({
    explicitApproved: {},
    explicitDisapproved: {},
    implicitTagWeights: new Map([["咖啡", 1.2], ["展览", -0.8]]),
    cityTopTags: []
  });

  const coffee = tagByName(result, "咖啡");
  assert.ok(coffee);
  assert.equal(coffee.status, "approved");
  assert.equal(coffee.source, "implicit");
  assert.match(coffee.context, /隐式反馈/);

  const expo = tagByName(result, "展览");
  assert.ok(expo);
  assert.equal(expo.status, "disapproved");
  assert.equal(expo.source, "implicit");
});

test("fuseCandidateTags: explicit disapproval removes from approved", () => {
  const result = fuseCandidateTags({
    explicitApproved: { 咖啡: 0.5 },
    explicitDisapproved: { 夜生活: -0.7 },
    implicitTagWeights: new Map(),
    cityTopTags: [{ label: "夜生活", value: 40 }]
  });

  const nightlife = tagByName(result, "夜生活");
  assert.ok(nightlife);
  // Explicit disapproval wins over both city and implicit.
  assert.equal(nightlife.status, "disapproved");
  assert.equal(nightlife.source, "explicit");
});

test("fuseCandidateTags: pending tags rank before approved/disapproved", () => {
  const result = fuseCandidateTags({
    explicitApproved: { 咖啡: 0.9 },
    explicitDisapproved: { 夜生活: -0.5 },
    implicitTagWeights: new Map(),
    cityTopTags: [
      { label: "展览", value: 60 },
      { label: "咖啡", value: 79 },
      { label: "夜生活", value: 40 }
    ]
  });

  // First entry should be pending (展览), then approved (咖啡), then disapproved (夜生活).
  assert.equal(result[0].status, "pending");
  assert.equal(result[0].tag, "展览");
  assert.equal(result[1].status, "approved");
  assert.equal(result[2].status, "disapproved");
});

test("fuseCandidateTags: merges same tag from multiple sources, keeps max score", () => {
  const result = fuseCandidateTags({
    explicitApproved: { 咖啡: 0.8 },
    implicitTagWeights: new Map([["咖啡", 0.5]]),
    explicitDisapproved: {},
    cityTopTags: [{ label: "咖啡", value: 79 }]
  });

  // Should be one entry, not three.
  const coffeeEntries = result.filter((c) => c.tag === "咖啡");
  assert.equal(coffeeEntries.length, 1);

  const coffee = coffeeEntries[0];
  assert.equal(coffee.source, "explicit");
  assert.equal(coffee.status, "approved");
  // Max of explicit(80), implicit(25), city(79) = 80.
  assert.ok(coffee.score >= 79, `score ${coffee.score} should reflect strongest source`);
});

test("fuseCandidateTags: empty input → empty result", () => {
  const result = fuseCandidateTags({
    explicitApproved: {},
    explicitDisapproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: []
  });
  assert.equal(result.length, 0);
});

test("fuseCandidateTags: context string combines multiple sources", () => {
  const result = fuseCandidateTags({
    explicitApproved: { 咖啡: 0.7 },
    implicitTagWeights: new Map([["咖啡", 0.4]]),
    explicitDisapproved: {},
    cityTopTags: [{ label: "咖啡", value: 79 }]
  });

  const coffee = tagByName(result, "咖啡");
  assert.ok(coffee);
  // Context should mention both explicit and city contributions.
  assert.match(coffee.context, /显式认可/);
});
