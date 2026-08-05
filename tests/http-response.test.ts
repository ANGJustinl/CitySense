import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "@/lib/http-response";

test("readJsonResponse returns a successful JSON response", async () => {
  const result = await readJsonResponse<{ id: string }>(
    Response.json({ id: "submission-1" }, { status: 201 }),
    "创建投稿失败"
  );

  assert.deepEqual(result, { id: "submission-1" });
});

test("readJsonResponse prefers API error and includes status", async () => {
  await assert.rejects(
    () => readJsonResponse(Response.json({ error: "图片尺寸太小" }, { status: 400 }), "图片校验失败"),
    /图片校验失败：图片尺寸太小（HTTP 400）/
  );
});

test("readJsonResponse falls back to API message", async () => {
  await assert.rejects(
    () => readJsonResponse(Response.json({ message: "服务暂不可用" }, { status: 503 }), "提交投稿失败"),
    /提交投稿失败：服务暂不可用（HTTP 503）/
  );
});

test("readJsonResponse handles a plain-text internal server error", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("Internal Server Error", { status: 500 }), "提交投稿失败"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /提交投稿失败：Internal Server Error（HTTP 500）/);
      assert.doesNotMatch(error.message, /Unexpected token/);
      return true;
    }
  );
});

test("readJsonResponse hides an HTML proxy error", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("<!doctype html><html><body>Bad Gateway</body></html>", { status: 502 }), "创建投稿失败"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "创建投稿失败（HTTP 502）");
      assert.doesNotMatch(error.message, /html|Bad Gateway/i);
      return true;
    }
  );
});

test("readJsonResponse reports malformed JSON without exposing a syntax error", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response('{"error":', { status: 500 }), "图片上传准备失败"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "图片上传准备失败（HTTP 500）");
      assert.doesNotMatch(error.message, /JSON|Unexpected token/i);
      return true;
    }
  );
});

test("readJsonResponse rejects a successful non-JSON response", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("ok", { status: 200 }), "图片校验失败"),
    /图片校验失败：服务返回格式异常（HTTP 200）/
  );
});

test("readJsonResponse handles an empty error response", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response(null, { status: 504 }), "提交投稿失败"),
    /提交投稿失败（HTTP 504）/
  );
});

test("readJsonResponse truncates long plain-text errors", async () => {
  const detail = "x".repeat(500);

  await assert.rejects(
    () => readJsonResponse(new Response(detail, { status: 500 }), "地点搜索失败"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.length < 300);
      assert.match(error.message, /…（HTTP 500）$/);
      return true;
    }
  );
});
