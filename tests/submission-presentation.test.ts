import assert from "node:assert/strict";
import test from "node:test";
import { countSubmissionImages, groupSubmissionsForDisplay, SUBMISSION_DISPLAY_GROUPS, SUBMISSION_STATUS_META } from "@/server/submissions/presentation";

test("submission status metadata covers every workflow status", () => {
  const statuses = ["DRAFT", "SUBMITTED", "PROCESSING", "AUTO_PUBLISHED", "NEEDS_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN", "REMOVED"] as const;
  for (const status of statuses) {
    assert.ok(SUBMISSION_STATUS_META[status].label);
    assert.ok(SUBMISSION_STATUS_META[status].description);
  }
});

test("submission statuses are grouped by what the user needs", () => {
  assert.equal(SUBMISSION_STATUS_META.DRAFT.group, "ACTION_REQUIRED");
  assert.equal(SUBMISSION_STATUS_META.CHANGES_REQUESTED.group, "ACTION_REQUIRED");
  assert.equal(SUBMISSION_STATUS_META.PROCESSING.group, "IN_PROGRESS");
  assert.equal(SUBMISSION_STATUS_META.NEEDS_REVIEW.group, "IN_PROGRESS");
  assert.equal(SUBMISSION_STATUS_META.AUTO_PUBLISHED.group, "COMPLETED");
  assert.equal(SUBMISSION_STATUS_META.REJECTED.group, "COMPLETED");
  assert.deepEqual(SUBMISSION_DISPLAY_GROUPS.map((group) => group.key), ["ACTION_REQUIRED", "IN_PROGRESS", "COMPLETED"]);
});

test("submission image counts only safe and failed images", () => {
  assert.deepEqual(countSubmissionImages([
    { status: "SAFE" }, { status: "SAFE" }, { status: "FAILED" },
    { status: "RESERVED" }, { status: "UPLOADED" }, { status: "VALIDATING" }, { status: "DELETED" }
  ]), { valid: 2, failed: 1 });
  assert.deepEqual(countSubmissionImages([]), { valid: 0, failed: 0 });
});

test("grouping preserves input order and does not create empty records", () => {
  const submissions = [
    { id: "draft-1", status: "DRAFT" as const },
    { id: "done-1", status: "APPROVED" as const },
    { id: "draft-2", status: "CHANGES_REQUESTED" as const }
  ];
  const groups = groupSubmissionsForDisplay(submissions);
  assert.deepEqual(groups.ACTION_REQUIRED.map((item) => item.id), ["draft-1", "draft-2"]);
  assert.deepEqual(groups.COMPLETED.map((item) => item.id), ["done-1"]);
  assert.deepEqual(groups.IN_PROGRESS, []);
});
