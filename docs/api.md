# API 规范：CitySense

本文档记录前端、推荐服务、路线详情页、后续反馈系统之间共享的 API 契约。目标是让未完成任务可以复用同一套数据结构，避免把路线详情、高德地图和未来反馈日志各做一套。

## 设计原则

- 推荐接口负责生成路线，不负责渲染地图。
- 路线详情接口负责读取已生成的路线快照，不重新跑推荐。
- 地图前端只消费标准化 `map` 数据，不直接调用推荐算法。
- `recommendation_logs` 是路线快照、未来反馈、用户品味画像的共享锚点。
- 高德 Web 服务 ETA 仍在服务端调用；高德 JS API 只用于前端地图展示。

## 环境变量

服务端高德 ETA：

```bash
AMAP_API_KEY="高德 Web 服务 API key"
```

前端高德地图：

```bash
NEXT_PUBLIC_AMAP_JS_API_KEY="高德 JS API Web key"
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE="高德 JS API 安全密钥"
```

说明：

- `AMAP_API_KEY` 用于 `/api/recommend` 和 `/api/amap/route` 的服务端路径规划。
- `NEXT_PUBLIC_AMAP_JS_API_KEY` 和 `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` 只用于浏览器地图渲染。
- 如果前端高德 key 未配置，路线详情页必须显示静态路线预览，不能白屏。

参考：

- 高德地图 JS API 2.0 概述：https://lbs.amap.com/api/javascript-api-v2/summary
- 高德地图 JS API 2.0 快速上手：https://lbs.amap.com/api/javascript-api-v2/getting-started

## `POST /api/recommend`

用途：

- 根据用户输入生成 3 条路线。
- 写入推荐快照到 `recommendation_logs`。
- 返回可用于 `/routes/:id` 的 route id。

请求：

```ts
type RecommendRequest = {
  userId?: string
  // 匿名会话标识;profileKey = userId ?? sessionId,用于用户画像(TASK-P2-002)。
  sessionId?: string
  city: string
  area?: string
  origin?: {
    lat: number
    lng: number
  }
  interests: string[]
  mood: "quiet" | "lively" | "date" | "solo" | "random"
  budget: "low" | "medium" | "high"
  timeWindow: "now" | "tonight" | "weekend"
  useRealtimeTraffic?: boolean
  useSocialSignals?: boolean
}
```

响应：

```ts
type RecommendResponse = {
  routes: RecommendedRoute[]
  meta: {
    recommendationId: string
    candidateCount: number
    trafficProvider: "amap" | "estimated"
    ranker: string
    rankerVersion: string
    recallChannels: string[]
    // 用户画像 explain 摘要(TASK-P2-002)。source: profile=命中画像 / fallback=回退即时聚合 / empty=无画像。
    userProfile?: {
      version: string
      source: "profile" | "fallback" | "empty"
      updatedFrom: number
      updatedAt?: string
      topPositive: { dimension: string; key: string; weight: number }[]
      topNegative: { dimension: string; key: string; weight: number }[]
      recentExposureHits: number
    }
    generatedAt: string
  }
}
```

约束：

- `routes[*].id` 必须是详情页可读取的快照 id。
- 推荐接口只对粗排 Top 10 调用交通接口。
- 推荐结果写入失败时，接口应返回错误，避免产生不可打开的路线详情链接。
- 推荐结果应记录 ranker、rankerVersion、recallChannels 和 feature snapshot，用于后续评估。
- `routes[*].places` 透传 `area/priceLevel/quietness/popularity`,供反馈写入画像聚合维度(TASK-P2-002)。
- 画像只增强排序,不改变地点可执行性、城市信号匹配和交通重排原则。

## `POST /api/feedback`

用途：

- 记录路线级轻量反馈。
- 写入 `recommendation_feedbacks`。
- 尽量回填 `RecommendationLog.feedback`。
- 为后续用户画像和负反馈降权提供输入。

请求：

```ts
type FeedbackRequest = {
  recommendationLogId: string
  routeId: string
  userId?: string
  sessionId?: string
  value: "up" | "down" | "save" | "dismiss"
  reason?: string
}
```

响应：

```ts
type FeedbackResponse = {
  ok: true
}
```

隐私与可用性约束：

- 不记录精确实时位置到反馈事件。
- 必须校验 `recommendationLogId` 存在。
- 必须校验 `routeId` 属于该推荐日志的路线快照。
- `value` 只接受 `"up" | "down" | "save" | "dismiss"`。
- `reason` 最长 80 字符，只接受字母、数字、下划线和短横线；不接受任意长文本。
- `recommendation_feedbacks` 是 P0-004 反馈事实来源；`RecommendationLog.feedback` 回填失败不影响反馈写入成功。
- 负反馈只做近期降权，不能永久屏蔽同类内容。

## `GET` / `DELETE` `/api/user-profile`

用途(TASK-P2-002)：

- `GET` 返回指定 profileKey 的用户画像摘要,用于 UI explain 面板。
- `DELETE` 清空画像快照及其驱动数据(UserInteraction),清空后推荐回退通用逻辑。
- 不触发画像重算(重算只在 `/api/recommend` 读时懒重算 + TTL 失效)。

查询参数：

```ts
type UserProfileQuery = {
  // profileKey 或 userId 任选其一;匿名会话使用 recommend 请求时的 sessionId。
  profileKey?: string
  userId?: string
}
```

`GET` 响应：

```ts
type UserProfileResponse = {
  profileKey: string
  // 画像快照是否过期(超过 30 分钟 TTL 或有新反馈)。
  stale: boolean
  profile: {
    version: string
    source: "profile" | "fallback" | "empty"
    updatedFrom: number
    updatedAt?: string
    topPositive: { dimension: string; key: string; weight: number }[]
    topNegative: { dimension: string; key: string; weight: number }[]
    recentExposureHits: number
  }
}
```

`DELETE` 响应：

```ts
type UserProfileDeleteResponse = { ok: true; cleared: true } | { error: string }
```

约束：

- 画像由 `UserInteraction` 聚合驱动,维度:tag / source / area / priceLevel / quietnessBand / popularityBand / venue。
- 不保存精确浏览器坐标;area 仅区级粒度。
- 清空画像会删除该 profileKey 的 `UserInteraction`(画像数据源),但保留 `RecommendationFeedback`(权威反馈事实表)和 `RecommendationLog`(审计日志)。

## `POST` / `DELETE` `/api/chat`

用途(TASK-P2-004)：

- `POST` 流式返回 AI 助手回复(SSE),支持 function calling 工具调用。
- `DELETE` 清空指定 sessionId 的对话历史。
- 助手基于真实数据,绝不编造地点、活动、价格或评价。

请求(`POST`):

```ts
type ChatRequest = {
  sessionId?: string
  message: string
  context?: {
    profileKey?: string
    recommendationId?: string
    city?: string
    area?: string
  }
}
```

SSE 事件格式(每行 `data: {...}\n\n`):

```ts
// 助手回复增量
{ "type": "delta", "content": "片段" }
// 工具调用开始
{ "type": "tool_start", "tool": "recommend_routes", "display": "查询推荐路线" }
// 工具调用完成
{ "type": "tool_end", "tool": "recommend_routes", "display": "找到 3 条路线:..." }
// 错误(不中断流,助手会据此告知用户)
{ "type": "error", "message": "工具执行失败: ..." }
// 对话结束
{ "type": "done" }
```

可用工具(助手通过 function calling 调用):

- `recommend_routes` — 生成 3 条城市探索路线(复用 `recommend()`,会写 RecommendationLog)
- `get_city_pulse` — 查询城市/区域信号趋势(只读)
- `get_route_detail` — 查询已持久化路线详情(只读,需 routeId)
- `get_user_profile` — 查询当前用户画像摘要(只读)

`DELETE` 查询参数:

```ts
type ChatDeleteQuery = { sessionId: string }
```

`DELETE` 响应:

```ts
type ChatDeleteResponse = { ok: boolean; cleared: boolean }
```

约束:

- 无 `OPENAI_API_KEY` 时返回错误 SSE 事件(不崩溃)。
- 工具调用最多 3 轮,达到上限强制收尾。
- 对话历史存 Redis(24h TTL,上限 20 条);Redis 不可用时退化为无历史单轮。
- `recommend_routes` 工具默认 `useRealtimeTraffic: false`(路线耗时为估算值)。

环境变量:

```bash
# 复用现有 OPENAI_API_KEY(智谱)
OPENAI_API_KEY="你的智谱 API key"

# 可选:指定 chat 专用 base url 和模型(默认 paas/v4 + glm-4-flash)
CHAT_LLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
CHAT_LLM_MODEL="glm-4-flash"
```

## `GET /api/city-pulse`

用途：

- 返回城市脉搏面板所需的聚合信号。
- 展示热门标签、来源占比、反馈趋势和 ranker 使用情况。
- 查询失败时返回空数组，不能阻塞推荐主页面。

查询参数：

```ts
type CityPulseQuery = {
  city: string
  area?: string
}
```

响应：

```ts
type CityPulseResponse = {
  topTags: { label: string; value: number }[]
  sourceMix: { label: string; value: number }[]
  trafficCache: {
    providerMix: { label: "amap" | "estimated"; value: number }[]
    snapshotCount: number
    latestCapturedAt?: string
    latestAgeMinutes?: number
  }
  feedbackTrend: { label: string; value: number }[]
  rankerMix: { label: string; value: number }[]
  generatedAt: string
}
```

## `GET /api/routes/:id`

用途：

- 根据 route snapshot id 返回路线详情。
- 给 `/routes/:id` 页面和后续分享页使用。
- 给未来 `TASK-P0-004` 反馈接口复用 `recommendationId` 和 route id。

路径参数：

```ts
type RouteSnapshotId = `${recommendationId}__${routeLocalId}`
```

成功响应：

```ts
type RouteDetailResponse = {
  route: RecommendedRoute
  recommendation: {
    id: string
    userId?: string
    input: RecommendRequest
    generatedAt: string
  }
  map: {
    provider: "amap-jsapi"
    center?: [lng: number, lat: number]
    bounds?: {
      southWest: [lng: number, lat: number]
      northEast: [lng: number, lat: number]
    }
    polyline: [lng: number, lat: number][]
    markers: {
      id: string
      name: string
      index: number
      position: [lng: number, lat: number]
      address?: string
      type: "venue" | "event"
    }[]
  }
}
```

错误响应：

```ts
type RouteDetailError = {
  error: "Route not found" | "Invalid route id"
}
```

状态码：

- `200`：找到路线详情。
- `400`：route id 格式非法。
- `404`：推荐日志或路线不存在。

## 未来复用点

`TASK-P0-004`：

- `/api/feedback` 可以通过 route snapshot id 找到 `recommendation_logs`。
- 反馈写入 `recommendation_feedbacks`，并尽量回填 `RecommendationLog.feedback`。
- 负反馈可用同一条路线的 tags、places、scoreBreakdown 更新用户偏好。

`TASK-P1-003`：

- LLM 解释只读取 `RouteDetailResponse.route` 中的事实，不需要访问地图实例。

`TASK-P2-002`：

- 用户品味画像可以基于 `recommendation.input`、`route.places`、`feedback` 聚合。

## `POST /api/ingest/run`

用途：

- 创建 Source Adapter 采集任务。
- 写入 `IngestRun`，并将任务推送到 BullMQ 队列。
- 不在 API 请求内同步执行 adapter。

请求：

```ts
type IngestRunRequest = {
  city: string
  area?: string
  keywords: string[]
  sources?: string[]
  force?: boolean
  requestedBy?: string
}
```

成功响应：

```ts
type IngestRunQueuedResponse = {
  runId: string
  status: "queued"
  sources: string[]
  queuedAt: string
}
```

状态码：

- `202`：采集任务已入队。
- `400`：请求参数非法或包含未知 source。
- `503`：`REDIS_URL` 缺失或队列不可用。

约束：

- 必须配置 `DATABASE_URL` 和 `REDIS_URL`。
- worker 需要通过 `pnpm worker:ingest` 单独启动。
- 缺少 Redis 时不得降级为同步采集。

## `GET /api/ingest/status`

用途：

- 返回队列配置状态。
- 返回所有 Source Connector 的运行状态。
- 返回最近采集任务，或指定 `runId` 的任务详情。

查询参数：

```ts
type IngestStatusQuery = {
  runId?: string
}
```

响应：

```ts
type IngestStatusResponse = {
  queue: { configured: boolean }
  connectors: {
    source: string
    kind: string
    enabled: boolean
    status: string
    lastRunAt?: string
    lastSuccessAt?: string
    lastErrorAt?: string
    lastError?: string
    cooldownSeconds: number
  }[]
  recentRuns: {
    id: string
    city: string
    area?: string
    keywords: string[]
    sources: string[]
    status: string
    stats: unknown
    error?: string
    createdAt: string
    updatedAt: string
  }[]
  run?: unknown
}
```

说明：

- `status` 可能为 `queued`、`running`、`completed`、`partial_failed` 或 `failed`。
- connector 状态可能为 `active`、`not_configured`、`disabled`、`cooldown` 或 `error`。
