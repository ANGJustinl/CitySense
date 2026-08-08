import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVATAR_COUNT, defaultAvatarIndex, defaultAvatarPosition } from "@/lib/default-avatar";

test("default avatar keeps the same identity on the same portrait", () => {
  assert.equal(defaultAvatarIndex("user-42"), defaultAvatarIndex("user-42"));
  assert.deepEqual(defaultAvatarPosition("user-42"), defaultAvatarPosition("user-42"));
});

test("default avatar always maps into the nine-cell atlas", () => {
  for (const identity of ["北京", "上海", "guangzhou", "user-1", "user-999", null, undefined]) {
    const position = defaultAvatarPosition(identity);
    assert.ok(position.index >= 0);
    assert.ok(position.index < DEFAULT_AVATAR_COUNT);
    assert.ok([0, 50, 100].includes(position.x));
    assert.ok([0, 50, 100].includes(position.y));
  }
});

test("default avatar uses the same branded fallback for empty identities", () => {
  assert.deepEqual(defaultAvatarPosition("   "), defaultAvatarPosition(undefined));
});
