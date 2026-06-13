import assert from "node:assert/strict";
import test from "node:test";
import { toNormalizedEntityInput } from "@/server/ingest/normalize";
import { createTrendsHubAdapter } from "@/server/sources/adapters/trends-hub.adapter";
import { callMcpToolRaw, type McpClientDependencies } from "@/server/sources/mcp/mcp-client";

test("mcp raw client supports stdio connector configuration", async () => {
  let connected = false;
  let transportConfig: unknown;

  const dependencies: McpClientDependencies = {
    createSdkClient() {
      return {
        async connect() {
          connected = true;
        },
        async callTool() {
          return {
            content: [
              {
                type: "text",
                text: "<title>上海咖啡节热榜</title>"
              }
            ]
          };
        },
        async close() {}
      };
    },
    createTransport(config) {
      transportConfig = config;
      return {};
    }
  };

  const result = await callMcpToolRaw(
    {
      connector: "trends-hub",
      tool: "get_weibo_trending",
      input: {},
      config: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "mcp-trends-hub"],
        env: {
          TRENDS_HUB_HIDDEN_FIELDS: "cover"
        },
        timeoutMs: 30_000
      }
    },
    dependencies
  );

  assert.equal(result.status, "ok");
  assert.equal(connected, true);
  assert.deepEqual(transportConfig, {
    transport: "stdio",
    url: "",
    token: "",
    timeoutMs: 30_000,
    command: "npx",
    args: ["-y", "mcp-trends-hub"],
    env: {
      TRENDS_HUB_HIDDEN_FIELDS: "cover"
    }
  });
});

test("trends-hub adapter maps relevant hot trends into normalized city events", async () => {
  const adapter = createTrendsHubAdapter({
    tools: [{ name: "get_weibo_trending", label: "微博热搜" }],
    client: {
      async callToolRaw(call) {
        assert.equal(call.connector, "trends-hub");
        assert.equal(call.tool, "get_weibo_trending");
        assert.equal(call.config?.transport, "stdio");
        assert.equal(call.config?.command, "npx");
        return {
          connector: call.connector,
          tool: call.tool,
          status: "ok",
          data: {
            content: [
              {
                type: "text",
                text: [
                  "<title>上海静安咖啡节热度上升</title>",
                  "<description>静安寺周边咖啡市集和展览路线被频繁讨论</description>",
                  "<popularity>123456</popularity>",
                  "<link>https://s.weibo.com/weibo?q=%23coffee%23</link>"
                ].join("\n")
              },
              {
                type: "text",
                text: [
                  "<title> unrelated world news </title>",
                  "<description>no local signal</description>",
                  "<link>https://example.com/world</link>"
                ].join("\n")
              }
            ]
          }
        };
      }
    }
  });

  const events = await adapter.searchEvents({
    city: "上海",
    area: "静安寺",
    keywords: ["咖啡", "展览"]
  });
  const venues = await adapter.searchVenues({
    city: "上海",
    area: "静安寺",
    keywords: ["咖啡", "展览"]
  });

  assert.equal(adapter.status, "active");
  assert.equal(events.length, 1);
  assert.equal(venues.length, 0);
  assert.equal(events[0].source, "trends-hub");
  assert.equal(events[0].itemType, "event");
  assert.equal(events[0].city, "上海");
  assert.equal(events[0].area, "静安寺");
  assert.equal(events[0].sourceUrl, "https://s.weibo.com/weibo?q=%23coffee%23");
  assert.deepEqual(events[0].tags, ["全网热点", "微博热搜", "静安寺", "咖啡", "展览"]);
  assert.ok((events[0].trendScore ?? 0) > 50);

  const normalized = toNormalizedEntityInput(events[0], "trends-hub:test");
  assert.ok(normalized);
  assert.equal(normalized.entityType, "event");
  assert.equal(normalized.title, "上海静安咖啡节热度上升");
});
