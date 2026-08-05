import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_REASONS,
  feedbackReasonsFor,
  isFeedbackReasonAllowed
} from "@/server/recommendation/feedback-reasons";
import { feedbackSchema } from "@/server/recommendation/feedback";

const base = { recommendationLogId: "rec-1", routeId: "route-1" };

test("feedback reasons are grouped by feedback direction", () => {
  assert.deepEqual(feedbackReasonsFor("up"), ["interest_match", "atmosphere_match", "budget_match", "area_match"]);
  assert.deepEqual(feedbackReasonsFor("down"), ["not_interested", "too_noisy", "too_expensive", "area_dislike"]);
  assert.equal(FEEDBACK_REASONS.too_noisy.label, "环境太吵");
});

test("feedback schema accepts matching reasons", () => {
  assert.equal(feedbackSchema.parse({ ...base, value: "up", reason: "interest_match" }).reason, "interest_match");
  assert.equal(feedbackSchema.parse({ ...base, value: "down", reason: "too_noisy" }).reason, "too_noisy");
});

test("feedback schema rejects reasons with the wrong direction", () => {
  assert.equal(isFeedbackReasonAllowed("up", "too_expensive"), false);
  assert.throws(() => feedbackSchema.parse({ ...base, value: "up", reason: "too_expensive" }));
  assert.throws(() => feedbackSchema.parse({ ...base, value: "down", reason: "budget_match" }));
});
