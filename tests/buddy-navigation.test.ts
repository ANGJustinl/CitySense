import assert from "node:assert/strict";
import test from "node:test";
import { buddyComposePath, parseBuddyCompose, parseBuddyTab } from "@/lib/buddy-navigation";

test("buddy compose mode only accepts POST or AUTO", () => {
  assert.equal(parseBuddyCompose("POST"), "POST");
  assert.equal(parseBuddyCompose("AUTO"), "AUTO");
  assert.equal(parseBuddyCompose("invalid"), undefined);
});

test("buddy tab falls back to discover", () => {
  assert.equal(parseBuddyTab("mine"), "mine");
  assert.equal(parseBuddyTab("groups"), "groups");
  assert.equal(parseBuddyTab("other"), "discover");
});

test("buddy compose path preserves route and requested mode", () => {
  const path = buddyComposePath({ routeId: "rec__route", mode: "POST", tab: "mine" });
  assert.equal(path, "/buddy?routeId=rec__route&compose=POST&tab=mine");
});
