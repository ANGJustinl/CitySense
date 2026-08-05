import assert from "node:assert/strict";
import test from "node:test";
import {
  ProfileAccessError,
  requireOwnedProfileKey,
  sanitizeProfileScopedInput
} from "@/server/auth/profile-access";

test("profile access trusts the authenticated viewer over client identity", () => {
  assert.equal(requireOwnedProfileKey({ requestedProfileKey: "user1", viewerProfileKey: "viewer-uuid" }), "viewer-uuid");
  assert.equal(requireOwnedProfileKey({ requestedProfileKey: "other-user", sessionId: "anon-session", viewerProfileKey: "viewer-uuid" }), "viewer-uuid");
});

test("sanitizeProfileScopedInput replaces client identity for authenticated viewers", () => {
  const input = sanitizeProfileScopedInput(
    { userId: "user1", sessionId: "anon-session", city: "上海" },
    { viewerProfileKey: "viewer-uuid" }
  );
  assert.equal(input.userId, "viewer-uuid");
  assert.equal(input.sessionId, undefined);
});
test("profile access allows public demo users", () => {
  assert.equal(requireOwnedProfileKey({ requestedProfileKey: "user1" }), "user1");
  assert.equal(requireOwnedProfileKey({ requestedProfileKey: "user2" }), "user2");
});

test("profile access allows anonymous profile only when it matches sessionId", () => {
  assert.equal(
    requireOwnedProfileKey({
      requestedProfileKey: "anon-session",
      sessionId: "anon-session"
    }),
    "anon-session"
  );
});

test("profile access rejects arbitrary non-demo profile keys", () => {
  assert.throws(
    () =>
      requireOwnedProfileKey({
        requestedProfileKey: "user-x",
        sessionId: "anon-session"
      }),
    (error) => error instanceof ProfileAccessError && error.status === 403
  );
});

test("sanitizeProfileScopedInput strips empty userId and normalizes sessionId", () => {
  const input = sanitizeProfileScopedInput({
    userId: " ",
    sessionId: " anon-session ",
    city: "上海"
  });

  assert.equal(input.userId, undefined);
  assert.equal(input.sessionId, "anon-session");
});

test("sanitizeProfileScopedInput rejects non-demo userId without matching sessionId", () => {
  assert.throws(
    () =>
      sanitizeProfileScopedInput({
        userId: "user-x",
        sessionId: "anon-session"
      }),
    (error) => error instanceof ProfileAccessError && error.status === 403
  );
});
