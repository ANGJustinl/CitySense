# CitySense

CitySense 是黑客松阶段的城市信号推荐 Demo。当前 P0 版本包含 Next.js App Router 工作台、推荐 API、Source Adapter 骨架、高德 ETA 接入点，以及面向 Supabase Postgres 的 Prisma 数据模型。

## 运行

```bash
pnpm install
pnpm dev
```

## 环境变量

从 `.env.example` 复制 `.env`，然后按当前任务需要配置环境变量。

```bash
cp .env.example .env
```

数据库推荐链路需要：

```bash
DATABASE_URL="postgresql://..."
```

初始化或刷新 Demo 城市数据：

```bash
pnpm prisma:generate
pnpm db:seed
```

`pnpm db:seed` 会幂等写入 20+ 条上海活动和地点，覆盖徐汇、静安、长宁、黄浦、浦东，并保留小红书、豆瓣、B 站、高德 POI 等来源字段。推荐接口只读取这些已入库的规范化数据，不会在请求时实时调用 MCP 或爬虫。

Source Adapter 入库流水线需要：

```bash
REDIS_URL="redis://localhost:6379"
```

配置 `REDIS_URL` 后，`POST /api/ingest/run` 会创建 `IngestRun` 并把任务放入 BullMQ 队列。需要单独启动 worker 消费队列：

```bash
pnpm worker:ingest
```

可选并发配置：

```bash
INGEST_WORKER_CONCURRENCY=1
```

小红书和 B 站 Source Adapter 通过 MCP 服务接入。第一版使用远端 Streamable HTTP MCP 服务；未配置 URL 时，对应连接器会保持 `not_configured`，不会影响推荐接口或 mock 数据。

```bash
BILIBILI_MCP_URL="https://your-bilibili-mcp.example.com/mcp"
BILIBILI_MCP_TOKEN=""
XIAOHONGSHU_MCP_URL="http://localhost:18060/mcp"
XIAOHONGSHU_MCP_TOKEN=""
TRENDS_HUB_MCP_COMMAND="npx"
TRENDS_HUB_MCP_ARGS="-y mcp-trends-hub"
TRENDS_HUB_MCP_TOOLS="get_weibo_trending,get_zhihu_trending,get_toutiao_trending,get_thepaper_trending"
TRENDS_HUB_HIDDEN_FIELDS="cover"
TRENDS_HUB_MAX_ITEMS="30"
```

B 站 MCP 服务需要提供 `search_city_signals` tool。worker 会传入 `{ connector, city, area?, keywords, timeWindow?, itemType }`，并接受 tool 返回 `{ items: [...] }` 或直接返回数组。

小红书 MCP 使用 `xpzouying/xiaohongshu-mcp`，默认暴露 `http://localhost:18060/mcp`。当前 compose 固定从 `0cf885c2d02745678ec6cc91b401d898373064e9` 构建，包含扫码后的验证码提交工具：

```bash
docker compose -f docker-compose.xiaohongshu-mcp.yml build
docker compose -f docker-compose.xiaohongshu-mcp.yml up -d
docker compose -f docker-compose.xiaohongshu-mcp.yml logs -f
```

该服务首次使用需要完成小红书登录。可以在 `/admin/sources` 生成二维码并检查登录状态；扫码后如果小红书 App 收到验证码，在管理页输入并提交即可。登录态会保存在 `docker/xiaohongshu-mcp/data`。CitySense 的小红书 adapter 会调用 `search_feeds`，将搜索结果映射到现有 raw/normalized 入库流水线，不会调用发布、点赞、收藏等写操作工具。

Trends Hub 使用 `ANGJustinl/mcp-trends-hub` / `mcp-trends-hub` npm 包，服务形态是 stdio MCP，不需要 HTTP URL。CitySense 会通过官方 SDK 的 `StdioClientTransport` 执行 `TRENDS_HUB_MCP_COMMAND` 和 `TRENDS_HUB_MCP_ARGS`，默认调用微博、知乎、头条和澎湃热榜工具。adapter 会把工具返回的 `<title>...</title>` 文本内容映射为 `RawSourceItemDetail[]`，并按当前采集请求的 `city`、`area`、`keywords` 做相关性过滤，避免把无关全网热点直接写入城市库。

实时 ETA 排序需要：

```bash
AMAP_API_KEY="your-amap-web-service-key"
```

`AMAP_API_KEY` 必须是高德开放平台的 Web 服务 API key。配置后，推荐接口只会对粗排后的 Top 10 候选调用高德 ETA，并将成功结果缓存到 `traffic_snapshots`。如果高德失败或未配置 key，推荐仍会使用估算交通耗时降级返回。

路线详情页的浏览器地图需要：

```bash
NEXT_PUBLIC_AMAP_JS_API_KEY="your-amap-js-api-web-key"
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE="your-amap-js-api-security-code"
```

这两个变量用于高德地图 JS API 2.0。未配置时，路线详情页会显示静态路线预览。

## 核心接口

- `POST /api/recommend` 返回 3 条可执行城市路线。
- `GET /api/routes/:id` 返回路线详情、地图 polyline 和站点 markers。
- `POST /api/feedback` 记录轻量反馈事件。
- `POST /api/ingest/run` 创建 Source Adapter 采集任务并入队。
- `GET /api/ingest/status` 返回队列、连接器和采集任务状态。
- `POST /api/admin/xhs-login/qrcode` 生成小红书 MCP 登录二维码。
- `GET /api/admin/xhs-login/status` 检查小红书 MCP 登录状态。
- `POST /api/admin/xhs-login/verification-code` 提交小红书扫码后的验证码。
- `POST /api/amap/route` 获取或估算路线 ETA。

## 架构原则

实时推荐链路不直接爬取外部平台，也不实时调用 MCP 服务。Source Adapter 和 worker 负责提前沉淀城市信号；推荐 API 读取规范化候选数据，并且只对短名单调用交通接口。
