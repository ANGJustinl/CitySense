import test from "node:test";
import assert from "node:assert/strict";
import { buddyStateTesting } from "../server/buddy/state-machine";

test("buddy intent state machine rejects invalid applications", () => {
  const future = new Date(Date.now() + 60_000);
  assert.equal(buddyStateTesting.canApply({ mode: "POST", status: "ACTIVE", ownerId: "a", expiresAt: future }, "b"), true);
  assert.equal(buddyStateTesting.canApply({ mode: "POST", status: "ACTIVE", ownerId: "a", expiresAt: future }, "a"), false);
  assert.equal(buddyStateTesting.canApply({ mode: "AUTO", status: "ACTIVE", ownerId: "a", expiresAt: future }, "b"), false);
  assert.equal(buddyStateTesting.canApply({ mode: "POST", status: "MATCHED", ownerId: "a", expiresAt: future }, "b"), false);
});

test("messages require an active group and unblocked member", () => {
  assert.equal(buddyStateTesting.canSendMessage({ status: "ACTIVE" }, "ACTIVE", false), true);
  assert.equal(buddyStateTesting.canSendMessage({ status: "CANCELLED" }, "ACTIVE", false), false);
  assert.equal(buddyStateTesting.canSendMessage({ status: "ACTIVE" }, "ACTIVE", true), false);
});
