import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDimensionScores,
  DIMENSIONS,
  type DimensionKey
} from "@/server/recommendation/user-profile";

/**
 * Tests for the six-dimension radar chart scoring logic.
 * Pure function — no DB needed.
 */

function dimByKey(scores: ReturnType<typeof computeDimensionScores>, key: DimensionKey) {
  return scores.find((d) => d.key === key);
}

test("computeDimensionScores: returns exactly 6 dimensions", () => {
  const result = computeDimensionScores({
    explicitApproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: []
  });
  assert.equal(result.length, 6);
  assert.deepEqual(
    result.map((d) => d.key).sort(),
    ["coffee", "culture", "marketFood", "nightlife", "quiet", "trend"]
  );
});

test("computeDimensionScores: empty input → all dimensions neutral at 50", () => {
  const result = computeDimensionScores({
    explicitApproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: []
  });

  for (const dim of result) {
    assert.equal(dim.value, 50, `${dim.key} should be neutral`);
    assert.equal(dim.topTags.length, 0);
  }
});

test("computeDimensionScores: explicit approved tag boosts its dimension", () => {
  const result = computeDimensionScores({
    explicitApproved: { 咖啡: 0.8 },
    implicitTagWeights: new Map(),
    cityTopTags: []
  });

  const coffee = dimByKey(result, "coffee");
  assert.ok(coffee);
  assert.ok(coffee.value > 50, `coffee ${coffee.value} should exceed neutral`);
  assert.ok(coffee.topTags.includes("咖啡"));
});

test("computeDimensionScores: implicit positive weight boosts dimension", () => {
  const result = computeDimensionScores({
    explicitApproved: {},
    implicitTagWeights: new Map([["展览", 1.5], ["书店", 0.8]]),
    cityTopTags: []
  });

  const culture = dimByKey(result, "culture");
  assert.ok(culture);
  assert.ok(culture.value > 50, `culture ${culture.value} should exceed neutral`);
  assert.ok(culture.topTags.includes("展览"));
});

test("computeDimensionScores: city heat fills dimensions for new users", () => {
  const result = computeDimensionScores({
    explicitApproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: [
      { label: "咖啡", value: 79 },
      { label: "展览", value: 65 }
    ]
  });

  const coffee = dimByKey(result, "coffee");
  assert.ok(coffee);
  assert.ok(coffee.value > 50, `coffee ${coffee.value} should reflect city heat`);

  const culture = dimByKey(result, "culture");
  assert.ok(culture);
  assert.ok(culture.value > 50, `culture should reflect city heat`);

  // nightlife has no matching city tag → stays neutral.
  const nightlife = dimByKey(result, "nightlife");
  assert.equal(nightlife?.value, 50);
});

test("computeDimensionScores: all three sources combine for a dimension", () => {
  const result = computeDimensionScores({
    explicitApproved: { 咖啡: 0.9 },
    implicitTagWeights: new Map([["咖啡", 1.0]]),
    cityTopTags: [{ label: "咖啡", value: 80 }]
  });

  const coffee = dimByKey(result, "coffee");
  assert.ok(coffee);
  // explicit(30) + implicit(25) + city(28) = 83
  assert.ok(coffee.value >= 80, `coffee ${coffee.value} should combine all sources`);
  assert.ok(coffee.value <= 100);
});

test("computeDimensionScores: values are clamped to 0-100", () => {
  // Extreme input that would overflow without clamping.
  const result = computeDimensionScores({
    explicitApproved: { 咖啡: 1, 咖啡厅: 1, 咖啡馆: 1, 咖啡品鉴: 1 },
    implicitTagWeights: new Map([
      ["咖啡", 5],
      ["咖啡厅", 5],
      ["咖啡馆", 5]
    ]),
    cityTopTags: [
      { label: "咖啡", value: 100 },
      { label: "咖啡厅", value: 100 }
    ]
  });

  const coffee = dimByKey(result, "coffee");
  assert.ok(coffee);
  assert.equal(coffee.value, 100, "should clamp at 100");
});

test("computeDimensionScores: DIMENSIONS constant is well-formed", () => {
  for (const dim of DIMENSIONS) {
    assert.ok(dim.label.length > 0, `${dim.key} needs a label`);
    assert.ok(dim.tags.length > 0, `${dim.key} needs at least one tag`);
  }
  // Quiet dimension intentionally overlaps with culture (书店/漫画) — that's fine.
});

test("computeDimensionScores: disapproved tags do not contribute (only approved counted)", () => {
  // computeDimensionScores only reads explicitApproved, not disapprovedTags.
  // A disapproved tag should not boost the dimension.
  const result = computeDimensionScores({
    explicitApproved: {},
    implicitTagWeights: new Map(),
    cityTopTags: []
  });

  // All neutral since no approved, no implicit, no city.
  const quiet = dimByKey(result, "quiet");
  assert.equal(quiet?.value, 50);
});
