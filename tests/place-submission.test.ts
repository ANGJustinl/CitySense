import assert from "node:assert/strict";
import test from "node:test";
import { placeSubmissionSchema, submissionContentHash } from "@/server/submissions/schema";

const valid = {
  name: "隐巷书店",
  description: "一家藏在老洋房二楼的小型独立书店，适合安静阅读和看展。",
  city: "北京",
  area: "静安",
  address: "上海市静安区愚园路123号2楼",
  userLat: 31.22,
  userLng: 121.44,
  tags: ["书店", "安静"]
};

test("submission schema accepts a complete novel venue", () => {
  const parsed = placeSubmissionSchema.parse(valid);
  assert.equal(parsed.name, "隐巷书店");
  assert.deepEqual(parsed.tags, ["书店", "安静"]);
});

test("submission schema accepts a short practical recommendation", () => {
  const parsed = placeSubmissionSchema.parse({ ...valid, description: "安静阅读，适合慢慢逛一会儿。" });
  assert.equal(parsed.description, "安静阅读,适合慢慢逛一会儿。");
});

test("submission schema defaults city to Beijing", () => {
  const parsed = placeSubmissionSchema.parse({ ...valid, city: undefined });
  assert.equal(parsed.city, "北京");
});
test("submission schema accepts optional tags and coordinates", () => {
  const withoutOptional = { ...valid, tags: undefined, userLat: undefined, userLng: undefined };
  const parsed = placeSubmissionSchema.parse(withoutOptional);
  assert.deepEqual(parsed.tags, []);
  assert.equal(parsed.userLat, undefined);
  assert.equal(parsed.userLng, undefined);
});

test("submission schema rejects invalid or partial coordinates", () => {
  assert.equal(placeSubmissionSchema.safeParse({ ...valid, userLat: 100 }).success, false);
  assert.equal(placeSubmissionSchema.safeParse({ ...valid, userLng: undefined }).success, false);
  assert.equal(placeSubmissionSchema.safeParse({ ...valid, userLat: undefined }).success, false);
});

test("submission schema strips invisible controls and deduplicates tags", () => {
  const parsed = placeSubmissionSchema.parse({ ...valid, name: "隐巷​书店", tags: ["书店", "书店"] });
  assert.equal(parsed.name, "隐巷书店");
  assert.deepEqual(parsed.tags, ["书店"]);
});

test("submission content hash is stable with and without coordinates", () => {
  assert.equal(submissionContentHash(placeSubmissionSchema.parse(valid)), submissionContentHash(placeSubmissionSchema.parse(valid)));
  const withoutCoordinates = placeSubmissionSchema.parse({ ...valid, userLat: undefined, userLng: undefined });
  assert.equal(submissionContentHash(withoutCoordinates), submissionContentHash(withoutCoordinates));
});
