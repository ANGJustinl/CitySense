import assert from "node:assert/strict";
import test from "node:test";
import {
  buddyAvatarFallback,
  buddyPaceLabel,
  buddyStatusLabel,
  buddyTabHref,
  summarizeBuddyStops,
} from "@/lib/buddy-display";
import type { BuddyRouteView } from "@/server/buddy/types";

const stops: BuddyRouteView["stops"] = [
  { id: "1", name: "第一站", tags: [] },
  { id: "2", name: "第二站", tags: [] },
  { id: "3", name: "第三站", tags: [] },
  { id: "4", name: "第四站", tags: [] },
];

test("buddy display maps internal states and pace to readable Chinese", () => {
  assert.equal(buddyStatusLabel("MATCHED"), "已经同路");
  assert.equal(buddyStatusLabel("PENDING"), "等待回应");
  assert.equal(buddyStatusLabel("ACTIVE", "group"), "同行进行中");
  assert.equal(buddyStatusLabel("unknown-state"), "状态已更新");
  assert.equal(buddyPaceLabel("relaxed"), "慢慢走");
});

test("buddy route line truncates stops and reports the remainder", () => {
  assert.deepEqual(summarizeBuddyStops(stops, 3), {
    visible: stops.slice(0, 3),
    remaining: 1,
  });
});

test("buddy tab href preserves route filtering", () => {
  assert.equal(buddyTabHref({ tab: "discover", routeId: "rec__route" }), "/buddy?routeId=rec__route");
  assert.equal(buddyTabHref({ tab: "mine", routeId: "rec__route" }), "/buddy?routeId=rec__route&tab=mine");
  assert.equal(buddyTabHref({ tab: "groups" }), "/buddy?tab=groups");
});

test("buddy avatar fallback uses the first visible character", () => {
  assert.equal(buddyAvatarFallback("  林北  "), "林");
  assert.equal(buddyAvatarFallback(""), null);
  assert.equal(buddyAvatarFallback(null), null);
});
