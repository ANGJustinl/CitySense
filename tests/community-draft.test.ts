import assert from "node:assert/strict";
import test from "node:test";
import { communityDraftKey, parseCommunityDraft, serializeCommunityDraft } from "@/lib/community-draft";

test("community draft uses a user-scoped storage key", () => {
  assert.equal(communityDraftKey("user-42"), "citysense:community-draft:user-42");
});

test("community draft round-trips editor fields and caps venues", () => {
  const savedAt = new Date("2026-08-08T10:00:00.000Z");
  const value = serializeCommunityDraft({
    body: "傍晚的胡同很安静。",
    city: "北京",
    area: "东城",
    venues: [
      { id: "1", name: "第一站", area: "东城" },
      { id: "2", name: "第二站", area: null },
      { id: "3", name: "第三站", area: "西城" },
      { id: "4", name: "不应保留", area: null }
    ]
  }, savedAt);
  assert.deepEqual(parseCommunityDraft(value), {
    version: 1,
    body: "傍晚的胡同很安静。",
    city: "北京",
    area: "东城",
    venues: [
      { id: "1", name: "第一站", area: "东城" },
      { id: "2", name: "第二站", area: null },
      { id: "3", name: "第三站", area: "西城" }
    ],
    savedAt: "2026-08-08T10:00:00.000Z"
  });
});

test("community draft rejects malformed or stale payloads", () => {
  assert.equal(parseCommunityDraft(null), null);
  assert.equal(parseCommunityDraft("not-json"), null);
  assert.equal(parseCommunityDraft(JSON.stringify({ version: 2 })), null);
  assert.equal(parseCommunityDraft(JSON.stringify({ version: 1, body: "", city: "北京", area: "", venues: [{ id: 1 }], savedAt: "now" }))?.venues.length, 0);
});
