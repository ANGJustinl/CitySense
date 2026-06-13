import assert from "node:assert/strict";
import test from "node:test";
import { toNormalizedEntityInput } from "@/server/ingest/normalize";
import { createMcpSourceAdapter } from "@/server/sources/adapters/mcp-source.adapter";
import { createXiaohongshuMcpAdapter } from "@/server/sources/adapters/xiaohongshu.adapter";
import { callMcpTool, type McpClientDependencies } from "@/server/sources/mcp/mcp-client";

test("mcp client returns not_configured when connector url is missing", async () => {
  let connected = false;
  const result = await callMcpTool(
    {
      connector: "bilibili",
      tool: "search_city_signals",
      input: { city: "上海", keywords: ["展览"] },
      config: { url: "" }
    },
    {
      createSdkClient() {
        connected = true;
        throw new Error("should not create sdk client");
      }
    }
  );

  assert.equal(result.status, "not_configured");
  assert.equal(result.data, null);
  assert.equal(connected, false);
});

test("mcp client extracts tool output from sdk content", async () => {
  const dependencies: McpClientDependencies = {
    createSdkClient() {
      return {
        async connect() {},
        async callTool() {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  items: [
                    {
                      id: "bili-1",
                      title: "B站城市探店切片",
                      itemType: "event",
                      city: "上海",
                      tags: ["探店"]
                    }
                  ]
                })
              }
            ]
          };
        },
        async close() {}
      };
    },
    createTransport() {
      return {};
    }
  };

  const result = await callMcpTool(
    {
      connector: "bilibili",
      tool: "search_city_signals",
      input: { city: "上海", keywords: ["探店"] },
      config: { url: "https://mcp.example.com/bilibili" }
    },
    dependencies
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(result.data, {
    items: [
      {
        id: "bili-1",
        title: "B站城市探店切片",
        itemType: "event",
        city: "上海",
        tags: ["探店"]
      }
    ]
  });
});

test("mcp client reports tool errors and invalid payloads", async () => {
  const toolError = await callMcpTool(
    {
      connector: "bilibili",
      tool: "search_city_signals",
      input: {},
      config: { url: "https://mcp.example.com/bilibili" }
    },
    {
      createSdkClient() {
        return {
          async connect() {},
          async callTool() {
            throw new Error("remote tool failed");
          },
          async close() {}
        };
      },
      createTransport() {
        return {};
      }
    }
  );

  assert.equal(toolError.status, "tool_error");
  assert.match(toolError.error ?? "", /remote tool failed/);

  const invalidPayload = await callMcpTool(
    {
      connector: "bilibili",
      tool: "search_city_signals",
      input: {},
      config: { url: "https://mcp.example.com/bilibili" }
    },
    {
      createSdkClient() {
        return {
          async connect() {},
          async callTool() {
            return { content: [{ type: "text", text: "not json" }] };
          },
          async close() {}
        };
      },
      createTransport() {
        return {};
      }
    }
  );

  assert.equal(invalidPayload.status, "invalid_payload");
});

test("mcp source adapter maps service items into normalized city source items", async () => {
  const adapter = createMcpSourceAdapter({
    source: "bilibili",
    urlEnvVar: "BILIBILI_MCP_URL",
    tokenEnvVar: "BILIBILI_MCP_TOKEN",
    client: {
      async callTool(call) {
        assert.equal(call.input.itemType, "event");
        return {
          connector: call.connector,
          tool: call.tool,
          status: "ok",
          data: {
            items: [
              {
                id: "bili-event-1",
                title: "B站 livehouse 周末切片热榜",
                content: "本周末独立乐队演出讨论上升。",
                itemType: "event",
                city: "上海",
                area: "长宁",
                address: "凯旋路 851 号",
                lat: 31.216,
                lng: 121.424,
                tags: ["独立音乐", "livehouse"],
                trendScore: 82,
                confidence: 78
              },
              {
                id: "broken",
                title: "",
                itemType: "event",
                city: "上海",
                tags: []
              }
            ]
          }
        };
      }
    }
  });

  const previous = process.env.BILIBILI_MCP_URL;
  process.env.BILIBILI_MCP_URL = "https://mcp.example.com/bilibili";

  const events = await adapter.searchEvents({ city: "上海", keywords: ["livehouse"] });

  assert.equal(adapter.status, "active");
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "bilibili");
  assert.equal(events[0].sourceId, "bili-event-1");
  assert.equal(events[0].itemType, "event");
  assert.equal(events[0].status, "new");
  assert.deepEqual(events[0].tags, ["独立音乐", "livehouse"]);

  const normalized = toNormalizedEntityInput(events[0], "bilibili:bili-event-1");
  assert.ok(normalized);
  assert.equal(normalized.entityType, "event");
  assert.equal(normalized.title, "B站 livehouse 周末切片热榜");

  if (previous === undefined) {
    delete process.env.BILIBILI_MCP_URL;
  } else {
    process.env.BILIBILI_MCP_URL = previous;
  }
});

test("mcp source adapter stays not_configured without url", async () => {
  const previous = process.env.XIAOHONGSHU_MCP_URL;
  delete process.env.XIAOHONGSHU_MCP_URL;

  const adapter = createMcpSourceAdapter({
    source: "xiaohongshu",
    urlEnvVar: "XIAOHONGSHU_MCP_URL",
    tokenEnvVar: "XIAOHONGSHU_MCP_TOKEN"
  });

  assert.equal(adapter.status, "not_configured");
  assert.deepEqual(await adapter.searchVenues({ city: "上海", keywords: ["咖啡"] }), []);

  if (previous !== undefined) {
    process.env.XIAOHONGSHU_MCP_URL = previous;
  }
});

test("xiaohongshu adapter uses search_feeds and maps feed cards into city events", async () => {
  const previous = process.env.XIAOHONGSHU_MCP_URL;
  process.env.XIAOHONGSHU_MCP_URL = "http://localhost:18060/mcp";

  const adapter = createXiaohongshuMcpAdapter({
    client: {
      async callTool(call) {
        assert.equal(call.connector, "xiaohongshu");
        assert.equal(call.tool, "search_feeds");
        assert.equal(call.config?.timeoutMs, 120_000);
        assert.equal(call.input.keyword, "静安寺 上海 咖啡 展览");
        assert.equal(call.input.filters, undefined);

        return {
          connector: call.connector,
          tool: call.tool,
          status: "ok",
          data: [
            {
              id: "684100000000000001",
              xsecToken: "token-1",
              noteCard: {
                displayTitle: "武康路新展和咖啡路线",
                type: "normal",
                user: {
                  nickname: "上海周末观察"
                },
                interactInfo: {
                  likedCount: "120",
                  collectedCount: "34",
                  commentCount: "8"
                }
              }
            }
          ]
        };
      }
    }
  });

  const events = await adapter.searchEvents({ city: "上海", area: "静安寺", keywords: ["咖啡", "展览"] });

  assert.equal(events.length, 1);
  assert.equal(events[0].source, "xiaohongshu");
  assert.equal(events[0].sourceId, "684100000000000001");
  assert.equal(events[0].sourceUrl, "https://www.xiaohongshu.com/explore/684100000000000001?xsec_token=token-1");
  assert.equal(events[0].title, "武康路新展和咖啡路线");
  assert.equal(events[0].author, "上海周末观察");
  assert.equal(events[0].area, "静安寺");
  assert.deepEqual(events[0].tags, ["静安寺", "咖啡", "展览", "同城"]);
  assert.equal(events[0].trendScore, 62);
  assert.equal(events[0].popularity, 62);

  const normalized = toNormalizedEntityInput(events[0], "xiaohongshu:684100000000000001");
  assert.ok(normalized);
  assert.equal(normalized.entityType, "event");

  if (previous === undefined) {
    delete process.env.XIAOHONGSHU_MCP_URL;
  } else {
    process.env.XIAOHONGSHU_MCP_URL = previous;
  }
});

test("xiaohongshu adapter reuses one search_feeds result for concurrent event and venue lookups", async () => {
  const previous = process.env.XIAOHONGSHU_MCP_URL;
  process.env.XIAOHONGSHU_MCP_URL = "http://localhost:18060/mcp";
  let callCount = 0;

  const adapter = createXiaohongshuMcpAdapter({
    client: {
      async callTool(call) {
        callCount += 1;
        assert.equal(call.input.keyword, "静安寺 上海 咖啡 展览");
        await new Promise((resolve) => setTimeout(resolve, 10));

        return {
          connector: call.connector,
          tool: call.tool,
          status: "ok",
          data: [
            {
              id: "684100000000000002",
              noteCard: {
                displayTitle: "上海咖啡新展双线索",
                interactInfo: {
                  likedCount: "10"
                }
              }
            }
          ]
        };
      }
    }
  });

  const [events, venues] = await Promise.all([
    adapter.searchEvents({ city: "上海", area: "静安寺", keywords: ["咖啡", "展览"] }),
    adapter.searchVenues({ city: "上海", area: "静安寺", keywords: ["咖啡", "展览"] })
  ]);

  assert.equal(callCount, 1);
  assert.equal(events.length, 1);
  assert.equal(venues.length, 1);
  assert.equal(events[0].itemType, "event");
  assert.equal(venues[0].itemType, "venue");
  assert.equal(events[0].area, "静安寺");
  assert.deepEqual(events[0].tags, ["静安寺", "咖啡", "展览", "同城"]);

  if (previous === undefined) {
    delete process.env.XIAOHONGSHU_MCP_URL;
  } else {
    process.env.XIAOHONGSHU_MCP_URL = previous;
  }
});

test("xiaohongshu adapter surfaces search_feeds tool errors", async () => {
  const previous = process.env.XIAOHONGSHU_MCP_URL;
  process.env.XIAOHONGSHU_MCP_URL = "http://localhost:18060/mcp";
  const adapter = createXiaohongshuMcpAdapter({
    client: {
      async callTool(call) {
        return {
          connector: call.connector,
          tool: call.tool,
          status: "tool_error",
          data: null,
          error: "MCP error -32001: Request timed out"
        };
      }
    }
  });

  await assert.rejects(
    () => adapter.searchEvents({ city: "上海", keywords: ["咖啡"] }),
    /MCP error -32001/
  );

  if (previous === undefined) {
    delete process.env.XIAOHONGSHU_MCP_URL;
  } else {
    process.env.XIAOHONGSHU_MCP_URL = previous;
  }
});
