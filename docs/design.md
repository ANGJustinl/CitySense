# Design: Project CitySense（城市脉搏）技术设计文档

核心技术原则：

```txt
MCP / 爬虫负责收集城市信号
高德 API 负责判断实时可达性同时提供实时地图ui（叠加层）
推荐算法负责排序和路线组合
LLM 负责解释和表达
Next.js 负责产品体验和 API 编排
```

总体架构：

```txt
Next.js App
  ↓
API Orchestrator
  ↓
Recommendation Engine
  ↓
Supabase Postgres
  ↑
Source Adapter / MCP / Crawler
  ↑
高德 API / 城市交通数据
```

推荐请求链路：

```txt
POST /api/recommend
        ↓
读取用户输入与历史偏好
        ↓
从 events / venues / city_signals 召回候选
        ↓
本地规则粗排 Top 10
        ↓
调用高德 API 获取 ETA / 路线耗时
        ↓
交通重排
        ↓
组合 3 条路线
        ↓
LLM 生成解释
        ↓
写入 recommendation_logs
        ↓
返回推荐结果
```

关键约束：

* 推荐接口不实时爬虫。
* 高德 API 只打 Top-N 候选。
* LLM 不凭空推荐地点。
* 每条推荐必须可解释、可追溯、可降级。

```md
仓库架构
citysense/
  app/
    page.tsx
    discover/
      page.tsx
    routes/[id]/
      page.tsx
    admin/
      sources/
        page.tsx
    api/
      recommend/
        route.ts
      feedback/
        route.ts
      ingest/
        run/
          route.ts
        status/
          route.ts
      amap/
        route/
          route.ts

  components/
    city/
      RouteCard.tsx
      VenueCard.tsx
      CityPulsePanel.tsx
      SourceSignalBadge.tsx
      TrafficBadge.tsx

  server/
    recommendation/
      recommend.ts
      scoring.ts
      route-builder.ts
      traffic-rerank.ts

    sources/
      source.types.ts
      source-registry.ts
      adapters/
        xiaohongshu.adapter.ts
        douban.adapter.ts
        bilibili.adapter.ts
        mock.adapter.ts
      crawler/
        fetcher.ts
        parser.ts
        normalizer.ts
      mcp/
        mcp-client.ts
        mcp-tool-router.ts

    maps/
      amap.ts
      traffic.ts
      geocode.ts

    ai/
      extract-event.ts
      explain-route.ts
      classify-tags.ts

    db/
      prisma.ts

  workers/
    ingest-worker.ts
    normalize-worker.ts
    traffic-refresh-worker.ts

  prisma/
    schema.prisma
    seed.ts```