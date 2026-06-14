import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizedTasteImportSchema,
  mapAuthorizedTasteItemToInteraction,
  type AuthorizedTasteItem
} from "@/server/recommendation/authorized-taste";

const baseContext = {
  source: "xiaohongshu" as const,
  userId: "user-1",
  authorizedAt: "2026-06-14T00:00:00Z"
};

test("mapAuthorizedTasteItemToInteraction: title 截断到 60 字符（不保存原始全文）", () => {
  const longTitle = "一".repeat(200);
  const item: AuthorizedTasteItem = {
    title: longTitle,
    itemType: "note",
    tags: ["咖啡"],
    action: "liked"
  };
  const row = mapAuthorizedTasteItemToInteraction(item, baseContext);
  const context = row.context as { titleDigest: string };
  assert.equal(context.titleDigest.length, 60);
});

test("mapAuthorizedTasteItemToInteraction: tags 限 10 个、每项 40 字符", () => {
  const item: AuthorizedTasteItem = {
    title: "笔记",
    itemType: "note",
    tags: Array.from({ length: 20 }, (_, i) => `标签${i}`.padEnd(50, "x")),
    action: "saved"
  };
  const row = mapAuthorizedTasteItemToInteraction(item, baseContext);
  const context = row.context as { tags: string[] };
  assert.equal(context.tags.length, 10);
  assert.ok(context.tags.every((tag) => tag.length <= 40));
});

test("mapAuthorizedTasteItemToInteraction: sourceItemId 仅保留哈希摘要，不可逆", () => {
  const item: AuthorizedTasteItem = {
    sourceItemId: "xhs_note_abc123敏感内容",
    title: "笔记",
    itemType: "note",
    tags: [],
    action: "liked"
  };
  const row = mapAuthorizedTasteItemToInteraction(item, baseContext);
  assert.ok(row.itemId?.startsWith("hash:"), "itemId should be a hash digest");
  assert.ok(!row.itemId!.includes("敏感内容"), "itemId should not leak raw source id");
});

test("mapAuthorizedTasteItemToInteraction: action 命名空间与 feedback 隔离", () => {
  const item: AuthorizedTasteItem = {
    title: "笔记",
    itemType: "note",
    tags: [],
    action: "liked"
  };
  const row = mapAuthorizedTasteItemToInteraction(item, baseContext);
  // liked/saved/rated/watched/followed 与 feedback 的 up/down/save/dismiss 不重叠
  assert.notEqual(row.action, "up");
  assert.notEqual(row.action, "down");
  assert.notEqual(row.action, "save");
  assert.notEqual(row.action, "dismiss");
});

test("authorizedTasteImportSchema: 拒绝非法 source / action / 超长", () => {
  assert.throws(() =>
    authorizedTasteImportSchema.parse({
      userId: "u1",
      source: "weibo", // 非法
      authorizedAt: "2026-06-14T00:00:00Z",
      items: []
    })
  );

  assert.throws(() =>
    authorizedTasteImportSchema.parse({
      userId: "u1",
      source: "douban",
      authorizedAt: "2026-06-14T00:00:00Z",
      items: [
        {
          title: "书",
          itemType: "book",
          tags: [],
          action: "clicked" // 非法
        }
      ]
    })
  );
});

test("authorizedTasteImportSchema: rating 范围校验", () => {
  assert.throws(() =>
    authorizedTasteImportSchema.parse({
      userId: "u1",
      source: "bilibili",
      authorizedAt: "2026-06-14T00:00:00Z",
      items: [
        {
          title: "视频",
          itemType: "video",
          tags: [],
          action: "rated",
          rating: 99 // 超范围
        }
      ]
    })
  );
});
