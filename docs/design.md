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

## 2026-08 字体、社区与 Buddy 归档规范

### 全站字体

- `--font-display` 固定使用本地托管的霞鹜文楷 GB Lite Regular，只用于标题、路线主题和短叙事。
- `--font-body` 固定使用本地托管的霞鹜新晰黑，用于正文、按钮、表单、状态和数据。
- 两套字体通过 `next/font/local` 注入；正文预加载，展示字体按需加载，均采用 `font-display: swap`。
- 页面禁止重新引入外部字体 CDN。代码、验证码与技术编号保留系统等宽字体。
- 全站关闭字体合成，字重只使用 `400 / 600 / 700`，避免浏览器伪造文楷粗体。

### 社区内容链

```txt
路线详情 ──可读路线摘要──> 城市手记编辑台
                              ↓ 本地草稿
城市 / 地点 / 路线注脚 ──> 现有社区发布 API
                              ↓
城市或关注信息流 ──> 动态详情 ──> 评论 / 点赞 / 收藏 / 关注 / 举报
```

- 社区首页采用约 160px 的紧凑刊头、吸顶频道目录和非对称双列内容流；移动端回落为单列。
- 正文是发布页唯一主编辑区；城市、区域、地点与路线属于内容注脚，不展示内部路线 ID。
- 草稿仅保存在浏览器本地并按用户隔离，发布成功后清除，不产生新的服务端数据模型。
- 动态详情使用“正文 + 资料注脚”布局，评论继续位于正文下方；互动写入沿用现有 API 并提供失败回滚。
- 公开主页、收藏和榜单共享紧凑 Folio Header、头像、状态与空错误态规范。

### Buddy 历史档案

- 群组读取权限与写入权限分离：任何历史成员都可读取群组、路线和聊天；只有活动群组中的活动成员可发送消息或变更行程。
- 历史公开意向只允许发起人和已有申请者读取；自动匹配意向始终只允许发起人读取。
- 客户端根据群组状态与当前成员状态派生 `readOnly`，历史群组停止轮询并禁用发送、退出和决策操作。
- 历史内容永久只读，不提供恢复、重新激活或重新匹配入口；举报能力仍保留。
