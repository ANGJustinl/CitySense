import assert from "node:assert/strict";
import test from "node:test";
import { placeSubmissionSchema, submissionContentHash } from "@/server/submissions/schema";

const valid = {
  name: "隐巷书店",
  description: "一家藏在老洋房二楼的小型独立书店，适合安静阅读和看展。",
  city: "上海",
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

test("submission schema rejects invalid coordinates and empty tags", () => {
  assert.equal(placeSubmissionSchema.safeParse({ ...valid, userLat: 100 }).success, false);
  assert.equal(placeSubmissionSchema.safeParse({ ...valid, tags: [] }).success, false);
});

test("submission schema strips invisible controls and deduplicates tags", () => {
  const parsed = placeSubmissionSchema.parse({ ...valid, name: "隐巷​书店", tags: ["书店", "书店"] });
  assert.equal(parsed.name, "隐巷书店");
  assert.deepEqual(parsed.tags, ["书店"]);
});

test("submission content hash is stable", () => {
  assert.equal(submissionContentHash(placeSubmissionSchema.parse(valid)), submissionContentHash(placeSubmissionSchema.parse(valid)));
});
