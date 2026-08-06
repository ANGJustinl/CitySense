import assert from "node:assert/strict";
import test from "node:test";
import { executeChatTool, TOOL_DISPLAY_NAMES, CHAT_TOOLS } from "@/server/ai/chat-tools";

/**
 * TASK-P2-004 chat-tools handler 降级测试。
 *
 * executeChatTool 调用真实 prisma 函数(recommend/getCityPulse/...)，
 * 无法在无 DB 环境纯函数测试。这里只覆盖参数解析降级、未知工具、
 * 工具展示名映射等纯逻辑路径。
 *
 * 真实工具调用由真实 smoke 覆盖。
 */

const emptyContext = {
  sessionId: "test-session",
  profileKey: "test-session",
  city: "上海"
};

test("executeChatTool returns error string for invalid JSON arguments", async () => {
  const result = await executeChatTool("recommend_routes", "{invalid json", emptyContext);

  assert.ok(result.content.includes("参数解析失败"));
});

test("executeChatTool returns unknown tool message for unrecognized name", async () => {
  const result = await executeChatTool("nonexistent_tool", "{}", emptyContext);

  assert.ok(result.content.includes("未知工具"));
});

test("TOOL_DISPLAY_NAMES covers all defined tools", () => {
  const toolNames = CHAT_TOOLS.map((t) => t.function.name);

  for (const name of toolNames) {
    assert.ok(TOOL_DISPLAY_NAMES[name], `tool ${name} should have a display name`);
    assert.ok(typeof TOOL_DISPLAY_NAMES[name] === "string");
    // 中文名不应是英文工具名本身。
    assert.notEqual(TOOL_DISPLAY_NAMES[name], name);
  }
});

test("get_route_detail tool returns missing-param message without routeId", async () => {
  const result = await executeChatTool("get_route_detail", "{}", emptyContext);

  assert.ok(result.content.includes("缺少 routeId"));
});

test("get_user_profile tool returns anonymous hint without profileKey", async () => {
  const result = await executeChatTool("get_user_profile", "{}", {
    sessionId: undefined,
    profileKey: undefined,
    city: "上海"
  });

  assert.ok(result.content.includes("匿名") || result.content.includes("暂无"));
});

test("get_user_profile tool ignores model-supplied profileKey override", async () => {
  const result = await executeChatTool("get_user_profile", "{\"profileKey\":\"user2\"}", {
    sessionId: undefined,
    profileKey: undefined,
    city: "上海"
  });

  assert.ok(result.content.includes("匿名") || result.content.includes("暂无"));
});

test("profile-scoped chat tools reject context profileKey mismatch before DB work", async () => {
  const result = await executeChatTool("recommend_routes", "{}", {
    sessionId: "anon-session",
    profileKey: "user-x",
    city: "上海"
  });

  assert.ok(result.content.includes("profile access denied"));
});

test("write tools require login (appUserId) and return a login hint when absent", async () => {
  const anonContext = { sessionId: "anon", profileKey: undefined, city: "北京" };
  const writeTools = [
    "save_user_profile",
    "create_community_post",
    "submit_place",
    "create_buddy_intent",
    "apply_buddy_intent",
    "like_post",
    "bookmark_post",
    "follow_user"
  ];
  for (const tool of writeTools) {
    const result = await executeChatTool(tool, "{}", anonContext);
    assert.ok(result.content.includes("登录"), `tool ${tool} should ask for login, got: ${result.content}`);
  }
});

test("write tools validate required parameters before preparing", async () => {
  const loggedIn = { sessionId: "s", profileKey: "user1", appUserId: "user1", city: "北京" };
  const result = await executeChatTool("like_post", "{}", loggedIn);
  assert.ok(result.content.includes("postId"), `got: ${result.content}`);
});

test("write tools prepare a pending action instead of executing immediately", async () => {
  const loggedIn = { sessionId: "s", profileKey: "user1", appUserId: "user1", city: "北京" };
  const result = await executeChatTool("like_post", JSON.stringify({ postId: "post-1" }), loggedIn);
  assert.ok(result.content.includes("awaiting_confirmation"), `got: ${result.content}`);
  assert.ok(result.cards?.some((card) => card.kind === "action_pending"));
});
