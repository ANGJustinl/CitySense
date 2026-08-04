# 城市状态、时机感与可信推荐闭环

## 目标

本轮把推荐从“地点/活动可推荐”推进到“此刻可执行、状态有证据、来源边界清楚”。推荐接口保持只读缓存，不在用户请求中触发外部天气、情绪或采集刷新。

## 数据层

新增 `CityConditionSnapshot`，统一存储四类状态：

- `weather`：复用高德天气 adapter，缺少 `AMAP_API_KEY` 或请求失败时写入降级状态。
- `crowd`：用地点 popularity/quietness、活动热度、CitySignal 密度、交通拥堵估算，不宣称真实客流。
- `sentiment`：规则优先输出 `calm | hyped | noisy | neutral`，LLM 只在可用且样本足够时增强标签。
- `freshness`：汇总 source、raw item、CitySignal、traffic cache、condition cache 的最新时间。

每条状态包含 `city`、`area`、`venueId`、`condition`、`score`、`label`、`source`、`confidence`、`metadata`、`capturedAt`、`expiresAt`。

## 刷新链路

- `POST /api/city-state/refresh` 只负责把任务放入独立 BullMQ 队列，返回 `202`。
- `workers/city-state-refresh-worker.ts` 独立执行刷新，不复用 ingest worker payload。
- `/admin/sources` 复用已有城市/区域/force 输入，展示队列状态、最近刷新时间和四类状态摘要。
- `GET /api/city-state/status` 给 Admin 读取最近状态，不触发刷新。

## 推荐链路

推荐链路调整为：

`retrieveDatabaseCandidates -> rankCandidates -> traffic rerank -> read CityConditionSnapshot -> hard filter + light moment rerank -> buildRoutes -> planRouteLegs -> attach momentFit/evidence -> explainRoutes -> persist snapshot`

约束：

- 活动已结束或抵达时已结束，不进入 Top route 核心站点。
- 天气、人流、情绪、新鲜度只轻量影响排序。
- 推荐请求不调用高德天气、不调用 LLM 情绪、不触发采集。

## 展示与证据

- `CityPulseResponse.conditions` 驱动 CityPulse 展示天气、人流、情绪、新鲜度。
- `RecommendedRoute.momentFit` 展示 `whyNow`、ETA、天气、人流、情绪和新鲜度事实。
- `RecommendedRoute.evidence` 区分地点权威、活动来源、趋势证据、ETA 与估算状态。
- 小红书明确作为趋势证据，不作为地点权威；高德 POI/ETA 与 CitySense 估算状态分开标识。
- `/api/ingest/status` 追加 `normalization` 摘要：`pendingRaw`、`failedRaw`、`pendingBySource`、`failedBySource`、`lastNormalizedAt`，用于 Admin 判断 raw 入库后是否仍卡在 normalize 阶段。

## 回退策略

- 无城市状态或状态过期：降级展示，不阻塞推荐。
- 无高德天气 key：写入 `天气未接入` 降级快照。
- LLM 情绪超时、不可用或输出无效：回退规则结果。
- Redis 未配置：Admin 刷新接口返回 `503`，状态读取仍可用。

## 本轮验收记录（2026-06-15）

- 迁移：执行 `pnpm prisma migrate status`，当前 `.env` 指向的 PostgreSQL 已应用 11 个 migration，schema up to date；未执行 `migrate deploy`。
- Smoke 标识：`city=上海`、`area=静安`、`requestedBy=sessionId=codex-smoke`。
- City-state smoke：启动 Next dev 与 city-state worker，调用 `POST /api/city-state/refresh` 成功入队，jobId=`city-state--%E4%B8%8A%E6%B5%B7--%E9%9D%99%E5%AE%89--1781534335349`；轮询 `GET /api/city-state/status` 返回 4 类状态，均未过期：`weather=天气一般`、`crowd=相对宽松`、`sentiment=偏松弛`、`freshness=偏旧`。
- Recommend smoke：真实库最初 `上海/静安` 候选为空，保留式写入 3 条 `sourceKey=codex-smoke:amap-poi:*` 场馆和 6 条 `source=codex-smoke` city signal 后，调用 `POST /api/recommend` 返回 1 条路线。路线包含 `momentFit` 与 `evidence`，`trafficProvider=estimated`，证据角色包含 `amap-poi/place_authority`、`codex-smoke/trend_evidence`、`estimated/traffic_eta` 和 4 类 `condition_estimate`；caveat 明确 ETA 与人流为估算。
- Ingest health smoke：`GET /api/ingest/status` 返回 `normalization.pendingRaw=0`、`failedRaw=0`、`pendingBySource=[]`、`failedBySource=[]`、`lastNormalizedAt=2026-06-15T14:40:55.161Z`。
- 静态验证：`pnpm typecheck` 通过；`pnpm lint` 通过（保留 11 个既有 warning）；`pnpm test` 通过 261 个测试；`pnpm build` 通过。
