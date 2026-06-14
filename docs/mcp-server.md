# CitySense MCP Server

CitySense 暴露自身能力为一个 **MCP server**，任何兼容 MCP 的 agent（Claude Desktop、Cursor、Claude Code 等）都可以通过 stdio 直接连进来，调用推荐、路线、城市脉搏、采集状态等工具。

这与项目里已有的 MCP **client**（小红书/B站/Trends Hub adapter）方向相反：client 是 CitySense 去消费外部平台的工具；本 server 是把 CitySense 自己的能力对外开放给 agent。

## 启动

```bash
pnpm mcp:server
```

等价于 `node --env-file=.env --import tsx server/mcp/server.ts`。独立进程，**不依赖 Next.js 运行**——每个工具直接调用 `server/` 下的纯函数，直连 Postgres（Prisma）和高德 API。

> Windows 下 entry 检测用 `pathToFileURL` 做跨平台比较，无需额外配置。

Server 启动后通过 stderr 打印 banner（stdout 留给 JSON-RPC 协议，不能污染）：

```
[citysense-mcp v0.1.0] listening on stdio. tools: recommend_routes, get_route_detail, ...
```

## 环境变量

从 `.env` 自动加载（`--env-file=.env`）。

| 变量 | 必需 | 用途 |
|---|---|---|
| `DATABASE_URL` | 大多数工具必需 | Prisma 连 Postgres。recommend / get_route_detail / get_city_pulse / get_ingest_status / record_feedback 需要 |
| `AMAP_API_KEY` | 可选 | `resolve_traffic` 启用真实高德 ETA；缺省回退直线距离估算 |
| `REDIS_URL` | 不需要 | 本 server 不暴露 enqueueIngestRun（那是 worker 的事） |

未配置 `DATABASE_URL` 时，DB 相关工具返回结构化错误（不崩溃），提示配置变量。

## 工具清单

共 7 个工具，全部返回 `content: [{type:"text", text: JSON}]`，便于任何 agent 解析。

| 工具 | 委托函数 | 读/写 | 说明 |
|---|---|---|---|
| `recommend_routes` | `recommend()` | 写（快照） | 生成 3 条可执行城市路线；复用 `recommendRequestSchema` 默认值，agent 只传 `city`+`interests` 也能跑 |
| `get_route_detail` | `getRouteDetail()` | 读 | 按 `${recommendationId}__${routeLocalId}` 读路线快照 + 地图 view |
| `get_city_pulse` | `getCityPulse()` | 读 | 城市/区域聚合：topTags、sourceMix、trafficCache、feedbackTrend、rankerMix |
| `get_ingest_status` | `getIngestStatus()` | 读 | 所有 source connector 状态 + 最近采集任务 |
| `resolve_traffic` | `resolveTrafficInfo()` | 写（缓存） | 两点间 ETA/距离/拥堵，高德优先，估算降级 |
| `record_feedback` | `recordFeedback()` | 写 | 路线级反馈 up/down/save/dismiss，闭合反馈环 |
| `list_sources` | `getSourceAdapters()` | 读 | 列出所有注册的数据源及状态；不需 DB，是 agent 入门首选调用 |

每个工具带 MCP `annotations`（`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`），帮助 client 决策。

## Agent 配置示例

### Claude Desktop / Claude Code（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "citysense": {
      "command": "node",
      "args": ["--env-file=.env", "--import", "tsx", "server/mcp/server.ts"],
      "cwd": "D:/citysense/citysense/CitySense"
    }
  }
}
```

### Cursor（`.cursor/mcp.json`）

```json
{
  "mcpServers": {
    "citysense": {
      "command": "node",
      "args": ["--env-file=.env", "--import", "tsx", "server/mcp/server.ts"],
      "cwd": "D:/citysense/citysense/CitySense"
    }
  }
}
```

> `cwd` 必须指向项目根，让 `@/server/*` 路径别名和 `.env` 都能解析。如不指定 cwd，需用绝对路径调 `pnpm` 脚本：`pnpm --dir D:/citysense/citysense/CitySense mcp:server`。

### 典型 agent 对话流

1. `list_sources` → 了解当前有哪些数据源在线
2. `get_city_pulse({city:"上海"})` → 看现在城里什么热
3. `recommend_routes({city:"上海", interests:["咖啡","展览"], mood:"quiet"})` → 拿 3 条路线
4. 用 `get_route_detail` 打开其中一条看地图细节
5. 用户表态后 `record_feedback` 回写反馈

## 设计要点

- **直连纯函数，不代理 HTTP**：工具直接 `import` `server/` 下的函数（`recommend()` 等），不走 `localhost:3000`。好处：agent 不必先启动 web app；零序列化损耗；错误结构干净。
- **统一的错误包裹**：每个 handler 走 `runTool()`（见 `shared.ts`），成功 → JSON text content；失败 → `isError:true` + 简明 message，**不泄漏堆栈**。
- **DB 守卫**：`requireDatabaseUrl()` 在每个 DB 工具入口检查，缺失时返回友好提示而非让 Prisma 抛连接异常。
- **admin 工具暂不暴露**：小红书扫码登录、大麦验证码/cookie 管理等会 spawn 浏览器、改磁盘状态、且对应 HTTP 路由本身无鉴权——风险高，留作后续阶段按需加（并配 `destructiveHint` / 确认机制）。

## 测试

```bash
node --import tsx --test tests/mcp-server.test.ts
```

5 个测试覆盖：工具注册完整性（7 个）、`list_sources` 端到端、DB 缺失守卫、zod 入参校验、shared 包装器形状。用 SDK 的 `InMemoryTransport` 把真实 `Client` 连到 `createCitySenseMcpServer()`，跑完整 JSON-RPC 往返，零外部依赖（无 DB 也能跑）。

真实 stdio 联调（启动子进程）：

```js
// 临时脚本：StdioClientTransport spawn server/mcp/server.ts，调 listTools() + callTool("list_sources")
```

## 与现有 MCP client 的关系

```
外部平台 ──MCP──▶ CitySense (client, server/sources/mcp/mcp-client.ts)  → 入库
                                                                        ↑
                                                       推荐链路读取入库数据
                                                                        ↓
                                                  CitySense (server, server/mcp/server.ts) ──MCP──▶ Agent
```

两个 MCP 端点互不干扰：client 在 ingest worker 里跑，server 是独立 agent-facing 进程。
