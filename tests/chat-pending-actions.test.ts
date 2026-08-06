import assert from "node:assert/strict";
import test from "node:test";
import { createPendingAction, getPendingAction, cancelPendingAction, claimPendingAction, verifyPendingActionToken } from "@/server/ai/pending-actions";

const context = { appUserId: "00000000-0000-0000-0000-000000000001", sessionId: "chat-session" };

test("pending actions bind opaque tokens to the actor", () => {
  const { action, token } = createPendingAction({ tool: "like_post", args: { postId: "p1" }, context, preview: "点赞" });
  assert.equal(getPendingAction(action.id, context.appUserId).state, "awaiting_confirmation");
  assert.equal(verifyPendingActionToken(action, token), true);
  assert.equal(verifyPendingActionToken(action, `${token}x`), false);
  assert.throws(() => getPendingAction(action.id, "00000000-0000-0000-0000-000000000002"));
});

test("pending actions can only be claimed once", () => {
  const { action } = createPendingAction({ tool: "bookmark_post", args: { postId: "p2" }, context, preview: "收藏" });
  assert.equal(claimPendingAction(action.id, context.appUserId).state, "executing");
  assert.equal(claimPendingAction(action.id, context.appUserId).state, "executing");
});

test("cancelled actions cannot be claimed", () => {
  const { action } = createPendingAction({ tool: "follow_user", args: { targetUserId: "u2" }, context, preview: "关注" });
  assert.equal(cancelPendingAction(action.id, context.appUserId).state, "cancelled");
  assert.equal(claimPendingAction(action.id, context.appUserId).state, "cancelled");
});
