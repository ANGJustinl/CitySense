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
- `POST /api/amap/route` 获取或估算路线 ETA。

## 架构原则

实时推荐链路不直接爬取外部平台。Source Adapter 和 worker 负责提前沉淀城市信号；推荐 API 读取规范化候选数据，并且只对短名单调用交通接口。
