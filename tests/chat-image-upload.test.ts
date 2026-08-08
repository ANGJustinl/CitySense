import assert from "node:assert/strict";
import test from "node:test";
import {
  validateImages,
  validateChatImages,
  validatePostImages,
  MAX_CHAT_IMAGES,
  MAX_POST_IMAGES
} from "@/components/assistant/chat-image-upload";

/**
 * 聊天/手记图片前端校验纯逻辑测试。
 *
 * 这些函数无副作用、不触网,可直接测;真实上传由 smoke 覆盖(项目现状如此)。
 */

function imageFile(name: string, type: string, size: number) {
  // 构造一个满足 File 形状的轻量对象(validateImages 只读 name/type/size)。
  return { name, type, size } as unknown as File;
}

test("validateImages 接受合法 JPEG/PNG/WebP", () => {
  const files = [
    imageFile("a.jpg", "image/jpeg", 1024),
    imageFile("b.png", "image/png", 2048),
    imageFile("c.webp", "image/webp", 4096)
  ];
  const result = validateImages(files, 0, 9);
  assert.equal(result.valid.length, 3);
  assert.equal(result.errors.length, 0);
});

test("validateImages 拒绝不支持的格式", () => {
  const files = [imageFile("a.gif", "image/gif", 1024), imageFile("b.bmp", "image/bmp", 1024)];
  const result = validateImages(files, 0, 9);
  assert.equal(result.valid.length, 0);
  assert.ok(result.errors.length >= 1);
  assert.ok(result.errors.some((e) => e.includes("格式不支持")));
});

test("validateImages 拒绝超大文件(>10MB)", () => {
  const files = [imageFile("big.jpg", "image/jpeg", 11 * 1024 * 1024)];
  const result = validateImages(files, 0, 9);
  assert.equal(result.valid.length, 0);
  assert.ok(result.errors.some((e) => e.includes("10 MB")));
});

test("validateImages 受 max 上限约束,超出部分报错", () => {
  const files = Array.from({ length: 7 }, (_, i) => imageFile(`${i}.jpg`, "image/jpeg", 1024));
  const result = validateImages(files, 0, 5);
  assert.equal(result.valid.length, 5);
  assert.ok(result.errors.some((e) => e.includes("5")));
});

test("validateImages 考虑已有数量 existingCount", () => {
  const files = Array.from({ length: 3 }, (_, i) => imageFile(`${i}.jpg`, "image/jpeg", 1024));
  // 已有 4 张、上限 5 → 只能再传 1 张。
  const result = validateImages(files, 4, 5);
  assert.equal(result.valid.length, 1);
  assert.ok(result.errors.some((e) => e.includes("5")));
});

test("validateChatImages 用聊天上限(5)", () => {
  const files = Array.from({ length: 6 }, (_, i) => imageFile(`${i}.jpg`, "image/jpeg", 1024));
  const result = validateChatImages(files, 0);
  assert.equal(result.valid.length, MAX_CHAT_IMAGES);
});

test("validatePostImages 用手记上限(9)", () => {
  const files = Array.from({ length: 10 }, (_, i) => imageFile(`${i}.jpg`, "image/jpeg", 1024));
  const result = validatePostImages(files, 0);
  assert.equal(result.valid.length, MAX_POST_IMAGES);
  assert.equal(MAX_POST_IMAGES, 9);
});

test("validateImages 超出数量的 break 错误只产生一条(去重)", () => {
  // 5 张合法文件、上限 2 → break 错误在循环中只 add 一次,经 Set 去重仍为一条。
  const files = Array.from({ length: 5 }, (_, i) => imageFile(`${i}.jpg`, "image/jpeg", 1024));
  const result = validateImages(files, 0, 2);
  const limitErrors = result.errors.filter((e) => e.includes("最多上传 2"));
  assert.equal(limitErrors.length, 1);
});
