# 任务规划二：Project CitySense 真实 MVP 补齐

日期：2026-06-14

本文档承接 `docs/tasks.md`，用于规划 CitySense 从“黑客松 Demo”走向“真实 MVP”的下一阶段任务。

当前项目已经具备城市事件/地点入库、Source Adapter、LLM 归一化、高德 ETA、路线生成、地图工作台、来源信号、反馈和推荐日志。下一阶段重点不是继续堆更多来源或更复杂模型，而是补齐原始愿景中的四个产品能力：

1. 真正懂用户：形成可审计、可清空、可解释的长期品味画像。
2. 感知城市呼吸：把天气、人流/安静度、社交情绪热力变成可追溯的实时城市状态。
3. 像朋友一样表达：把路线推荐包装成有时机感、行动感的“城市提醒卡”。
4. 让信号可信：让普通用户看得懂为什么这不是商业榜单或随机拼接。

## 优先级定义

- `P0 真实 MVP 必补`：没有这些能力，产品仍主要是“路线推荐工具”，还不能成立为“城市大脑”。
- `P1 强化说服力`：不一定阻塞 MVP，但会明显提升用户信任、Demo 表达和产品气质。
- `P2 后续产品化`：可以等 P0/P1 稳定后再做，避免过早复杂化。

## 开发者审批流程

沿用 `docs/tasks.md` 的审批原则：

- 涉及数据库结构、用户数据、授权平台数据、外部 API、推荐权重、LLM 解析或来源采集行为的任务，必须先审批。
- 任务进入实现前，需要把状态从 `待审批` 改为 `已批准`，并填写审批人、日期和结论。
- 用户画像、授权数据导入、城市状态快照和可信度展示都涉及用户隐私或推荐解释边界，默认需要审批。
- 规划稿不代表可以直接开发；只有明确批准的任务可以进入实现。

任务状态：

- `待审批`：已规划，尚未开始实现。
- `已批准`：范围、风险和验收标准已确认，可以实现。
- `进行中`：正在开发。
- `已阻塞`：等待 API key、授权、产品决策或基础设施。
- `已完成`：已验证并交付。

## P0：真实 MVP 必补

### TASK2-P0-001：用户品味画像闭环

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及用户数据、长期画像、推荐权重和隐私删除能力。
- 来源：将 `docs/tasks.md` 中的 `TASK-P2-002：用户品味画像 MVP` 上调为真实 MVP P0。
- 审批人：angjustinl
- 审批日期：2026-06-14
- 审批结论：批准按 A→E 方案实施。重算画像以 `RecommendationFeedback` 为站内反馈事实源，`UserInteraction` 仅作为镜像/导入/兼容层，且只读 `action ∈ {liked,saved,rated,watched,followed}` 的导入类记录，避免同一次 feedback 双算。单次 down/dismiss 只做短期 route/item 级惩罚；泛化到 tag/source/area 的负偏好必须满足负样本 ≥2、更快衰减、硬上限。权重调整：`userAffinity` 0.05→0.10、`feedbackPenalty` -0.12→-0.10、新增 `exposurePenalty` -0.05，rankerVersion=`weighted-v1.2-profile`；无画像时必须保持当前行为（回退即时 interaction 聚合 → 再回退中性，不报错）。E 本轮只做授权品味导入契约、脱敏 mapper 和测试，不接 OAuth、不抓平台原始私密内容、不长期保存 raw 平台文本。实施完成后需通过 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
- 完成日期：2026-06-14
- 完成情况：A→E 全部实现并落地。
  - A：`server/recommendation/user-profile.ts` 提供 `recomputeUserProfile` / `loadUserProfile` / `loadUserProfileForRanking` / `getUserProfileSummary` / `clearUserProfile`，以及纯函数 `calculateUserAffinityFromProfile` / `calculateFeedbackPenaltyFromProfile` / `calculateExposurePenalty`。去重按 `(recommendationId, routeId, itemId)`；站内 feedback 与授权导入 action 命名空间隔离不双算；负偏好负样本≥2、更快衰减（1/0.5/0.2/0.05）、硬上限 30；正偏好硬上限 60；sampleSize<5 返回中性；任何异常回退空画像不抛错。
  - B：`scoring.ts` 权重调整为 `userAffinity 0.10` / `feedbackPenalty -0.10` / `exposurePenalty -0.05`，rankerVersion=`weighted-v1.2-profile`；`ScoreBreakdown` 新增 `exposurePenalty`。`features.ts` 画像优先、信号回退。`ranker.ts` 优先 `loadUserProfileForRanking`，画像空时回退 `loadUserRecommendationSignals`，行为等价改造前。
  - C：`RecommendResponse.meta` 新增 `profileApplied`；`CandidateFeatures` 新增 `profileFactors` / `profileHit` / `profileVersion`，随 feature snapshot 持久化可追溯。
  - D：`app/api/user-profile/route.ts` 提供 `GET ?userId=`（摘要，不返回 raw interactions）与 `DELETE ?userId=`（清空 metadata 保留行）。
  - E：`server/recommendation/authorized-taste.ts` 定义 `AuthorizedTasteImport` 契约、zod schema、脱敏 mapper（title 截断 60、tags 限 10×40、sourceItemId 仅哈希摘要）、`ingestAuthorizedTasteImport`；不接 OAuth、不抓平台原始私密内容、不长期保存 raw 文本。
  - 测试：新增 `tests/user-profile.test.ts`（10 例）与 `tests/authorized-taste.test.ts`（6 例）；更新 `recommendation-v1.test.ts` / `recommendation-p1-005b.test.ts` 的 rankerVersion 断言；4 个既有测试补 `exposurePenalty: 0`。
- 验证：`pnpm typecheck` ✅、`pnpm lint` ✅、`pnpm test` ✅（141 pass / 0 fail）。`pnpm build` 在 `/_global-error` 与 `/_not-found` 预渲染阶段报 `Cannot read properties of null (reading 'useContext')`；已用 `git stash` 在 clean main 上复现同一错误，确认是 Next.js 16.2.7 + React 19 在当前环境的既有预渲染问题，与本次改动无关。

背景与现状：

- 当前推荐请求支持 `userId`，反馈会写入 `recommendation_feedbacks`，并镜像到 `UserInteraction`。
- `UserPreference` 已存在，但还没有形成画像重算、画像读取、推荐接入、画像解释和清空闭环。
- 当前系统主要理解“本次输入”，还不能基于用户长期反馈或授权平台品味形成稳定偏好。

目标：

- 建立轻量、可解释、可重算的用户品味画像，不引入黑盒推荐模型。
- 同时刻画正偏好、负偏好和新鲜度：用户喜欢什么、反感什么、最近看腻了什么。
- 让老用户、匿名会话和无画像用户的推荐行为有清晰差异。
- 为后续小红书、豆瓣、B 站授权品味导入预留结构，但首版不强依赖 OAuth 全量完成。

范围：

- 新增画像服务，例如 `server/recommendation/user-profile.ts`。
- 从 `RecommendationLog`、`RecommendationFeedback`、`UserInteraction` 和近期推荐曝光重算最近 90 天画像。
- 使用确定性权重和时间衰减生成 `UserPreference.metadata` 画像快照。
- 画像字段建议包含：
  - `profileVersion`
  - `updatedFrom`
  - `positiveWeights`
  - `negativeWeights`
  - `sourceAffinity`
  - `areaAffinity`
  - `budgetAffinity`
  - `quietnessAffinity`
  - `recentExposure`
  - `topReasons`
  - `decayWindowDays`
- 推荐链路优先读取画像，读取失败时回退当前即时 interaction 聚合。
- `RecommendationFeatureSnapshot` 或推荐响应 meta 中记录画像命中的 top factors。
- 新增用户可见画像摘要与清空接口，例如：
  - `GET /api/user-profile`
  - `DELETE /api/user-profile`

建议拆分：

- TASK2-P0-001A：基于站内反馈和推荐日志生成画像。
- TASK2-P0-001B：推荐 ranker 接入画像版 `userAffinity`、`feedbackPenalty` 和重复曝光惩罚。
- TASK2-P0-001C：画像解释与 feature snapshot 追溯。
- TASK2-P0-001D：画像摘要/清空 API。
- TASK2-P0-001E：授权平台品味导入契约草案，先定义输入格式，不马上绑定完整 OAuth。

授权平台品味导入契约建议：

```ts
type AuthorizedTasteImport = {
  userId: string
  source: "xiaohongshu" | "douban" | "bilibili"
  authorizedAt: string
  expiresAt?: string
  items: {
    sourceItemId?: string
    title: string
    itemType: "note" | "book" | "movie" | "music" | "video" | "topic"
    tags: string[]
    action: "liked" | "saved" | "rated" | "watched" | "followed"
    rating?: number
    occurredAt?: string
  }[]
}
```

隐私边界：

- 不保存精确实时坐标到画像。
- 不保存原始平台私密内容全文，只保存经过用户授权的派生标签、来源、权重和摘要。
- 画像必须支持清空；清空后推荐回到无画像状态。
- LLM 不得凭空推断敏感属性，不把用户职业、收入、身份、健康等敏感信息写入画像。

验收标准：

- 有历史 `up/save` 的用户，更容易看到相同 tag/source/area/预算风格的候选，但仍受可执行地点、高德交通和城市信号约束。
- 有历史 `down/dismiss` 的用户，相同地点、主题或 source 会被降权。
- 最近多次曝光过的地点或路线主题会受到新鲜度惩罚。
- 无 `userId/sessionId`、画像为空或画像读取失败时，推荐接口回退通用推荐，不报错。
- 推荐结果或 feature snapshot 可追溯画像影响，例如 `tag:展览 +8`、`source:damai +3`、`recentlySeen:venue -6`。
- 用户可以清空画像；清空后画像权重不再影响推荐。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

风险与降级：

- 数据稀疏导致过拟合：需要最小样本阈值、权重上限和时间衰减。
- 负反馈可能只表达“这条路线组合不合适”，不能永久屏蔽地点或主题。
- 匿名 session 不稳定：匿名画像只做轻量增强，未来账号系统再迁移。
- 授权平台数据边界复杂：先做导入契约和派生画像，不先做全量 OAuth。

### TASK2-P0-002：实时城市状态 V0

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及外部 API、城市状态数据模型、LLM 情绪分类和推荐特征。

背景与现状：

- 当前实时能力主要是高德 ETA 和交通缓存。
- `quietness`、`popularity` 和 `trendScore` 更接近静态或半实时信号。
- 天气、人流密度、排队/拥挤、社交情绪热力还没有形成统一数据层。

目标：

- 建立“城市呼吸”状态层，让系统能回答：现在适不适合去、那里安不安静、附近热不热闹、天气是否影响路线。
- 所有状态必须有来源、时间戳、有效期和置信度。
- 推荐接口仍不实时爬虫；城市状态由 worker/API adapter 提前刷新并缓存。

建议数据模型：

```prisma
model CityConditionSnapshot {
  id          String   @id @default(cuid())
  city        String
  area        String?
  venueId     String?
  condition   String   // weather | crowd | sentiment | noise | freshness
  score       Float
  label       String?
  source      String
  confidence  Float    @default(0)
  metadata    Json?
  capturedAt  DateTime @default(now())
  expiresAt   DateTime?

  @@index([city])
  @@index([area])
  @@index([venueId])
  @@index([condition])
  @@index([capturedAt])
  @@index([expiresAt])
}
```

范围：

- 新增城市状态快照表或等价结构。
- 新增 `server/city-state/` 服务层，统一读取天气、人流、情绪和新鲜度。
- 天气 V0：优先使用高德天气或稳定公开天气 API，按城市/区域缓存。
- 人流/拥挤 V0：先用可解释估算，不追求真实客流：
  - 高德 ETA 拥堵状态。
  - POI popularity。
  - 同区域 city signal 密度。
  - 同时间活动数量。
  - 最近社交热度变化。
- 情绪热力 V0：对已入库小红书/趋势/大麦等文本做 LLM 或规则分类，输出 `positive/neutral/noisy/calm/hyped` 等有限标签。
- 推荐特征接入：城市状态只影响排序、提示和路线解释，不允许让不可执行地点进入路线。
- 城市脉搏面板接入：展示天气、人流、情绪和状态新鲜度。

建议拆分：

- TASK2-P0-002A：`CityConditionSnapshot` schema、读取服务和 TTL 规则。
- TASK2-P0-002B：天气 adapter 与天气缓存。
- TASK2-P0-002C：人流/安静度估算器。
- TASK2-P0-002D：社交情绪热力分类器。
- TASK2-P0-002E：推荐 ranker、LLM 解释和 CityPulse UI 接入。

验收标准：

- 系统能按城市/区域返回天气、人流/安静度、情绪热力和新鲜度状态。
- 每个状态都有 `source`、`capturedAt`、`expiresAt`、`confidence`。
- 缺少天气 key、LLM 超时或状态过期时，推荐仍可返回路线，并明确展示状态降级。
- 推荐解释可以使用事实化表达，例如“今晚有雨，路线优先减少室外步行段”。
- CityPulse 面板能展示城市状态来源和最近刷新时间。
- `/api/recommend` 不实时调用小红书、B 站、豆瓣或大麦；状态读取只来自缓存/数据库。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

风险与降级：

- 人流数据很难真实获取：V0 明确标注为估算，不宣称真实客流。
- 情绪热力容易被少量内容误导：需要样本数阈值和置信度，不足时显示“信号不足”。
- 天气 API 和高德配额有限：必须缓存，不能每次推荐实时调用全量区域。
- 状态不能压过安全和可执行性：宁可少推荐，也不能用热度把低质量地点推上去。

### TASK2-P0-003：此刻可执行判断与时机感

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及推荐特征、路线时间约束和 LLM 表达边界。

背景与现状：

- 当前路线有 `timeWindow`、高德 ETA、部分活动起止时间和分段路线。
- 但还没有严格判断“现在出发是否赶得上”“活动还有多久结束”“路线是否适合当前天气/人流”。
- 原始愿景中的推荐更像：“3 公里外的漫画原稿展还有 2 小时结束，现在出发刚好”。

目标：

- 将“路线是否此刻可执行”变成明确特征，而不是只靠 LLM 口吻。
- 给每条路线生成 `whyNow`、`urgency`、`arrivalFit`、`weatherFit`、`crowdFit` 等事实字段。
- 为 P1 的朋友式表达提供可靠事实输入。

范围：

- 在 route builder 后增加 `momentFit` 计算。
- 基于当前时间、用户 timeWindow、活动 start/endTime、路线 leg duration、建议停留时间和城市状态计算可执行性。
- 输出路线级字段建议：

```ts
type RouteMomentFit = {
  urgency: "now" | "soon" | "flexible" | "not_recommended"
  arrivalFit: "fits" | "tight" | "misses" | "unknown"
  weatherFit?: "good" | "mixed" | "poor" | "unknown"
  crowdFit?: "quiet" | "balanced" | "busy" | "unknown"
  whyNow: string[]
  facts: {
    eventEndsInMinutes?: number
    travelMinutes?: number
    latestDepartureAt?: string
    stateSnapshotIds?: string[]
  }
}
```

验收标准：

- 有明确结束时间的活动，系统能判断现在出发是否赶得上。
- 活动已结束、赶不上或时间严重冲突时，不应作为 Top route 的核心站点。
- 雨天/高温/拥堵等状态会影响 route tips 或排序，但不会编造事实。
- LLM 只能引用 `RouteMomentFit.facts` 中存在的事实。
- 无时间/天气/状态数据时降级为 `unknown`，不阻塞推荐。

风险与降级：

- 活动时间数据可能不完整：未知不等于不可去，应只降低时机感置信度。
- 停留时间主观：V0 可按地点类型给默认值，例如展览 60 分钟、咖啡 45 分钟、演出按活动时间。
- 时机感不应过度过滤：先用于解释和轻微排序，再观察结果质量。

### TASK2-P0-004：推荐算法权重归一化与冷启动优化

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及推荐权重变更（`docs/recommendation-system-plan.md` 明确要求审批）。
- 审批人：用户（本会话明确批准"全面优化 + 允许触碰审批项并同步 docs"）
- 审批日期：2026-06-15
- 完成日期：2026-06-15

背景与问题诊断（通过代码审计确认的 5 个核心问题）：

1. **正权重之和 = 1.34**（`scoring.ts`）：远超 1.0，导致高分候选饱和在 100、分数区分度被压缩、排序信号被淹没。
2. **匿名用户 userAffinity 恒为 50**：无画像用户无 exposure penalty，Top 路线几乎重复，冷启动体验差。
3. **trendScore 双重计数**（`signal-fusion.ts`）：`trendScore` 被 signal 回写提升后，又喂给 `socialTrend` 特征，social 权重被计入两次。
4. **文本召回阈值 0.03 过低**（`candidates.ts`）：召回大量低相关噪声，挤占候选池。
5. **area 画像维度是死代码**（`user-profile-v2.ts`）：声明了 area/budget/quietness/mood 四个维度但 recompute 从不填充，affinity 只用 tag/source。

完成情况（分 3 阶段实施，每阶段独立可测）：

- **阶段 1：Bug 修复与正确性校正（不触及审批边界）**
  - `signal-fusion.ts`：移除 trendScore 回写（L178），signal 只通过 `signalStrength` 单一通道影响 `socialTrend`，消除放大效应。
  - `candidates.ts`：文本召回 `similarity` 阈值 0.03 → 0.08，过滤明显无关项。
  - 新建 `feedback-weights.ts`：抽取共享 `FEEDBACK_INTERACTION_WEIGHT` 常量，`feedback.ts` 与 `user-profile-v2.ts` 统一引用，消除两处硬编码同步风险。
  - `user-profile.ts`：修正 `computeDimensionScores` 过期 JSDoc（实际 +15/cap 35、×10，非文档声称的 +30/cap 90、×25）。

- **阶段 2：权重归一化与冷启动（需审批）**
  - `scoring.ts`：正权重之和从 1.34 收敛到 **1.00**。`userAffinity` 0.35→0.18（仍是最强正向维度之一，但不再垄断排序），其余按比例调整。`calculateFinalScore` 成为真正的加权平均（all-100→100, all-50→50, all-0→0）。
  - `features.ts` + `types.ts` + `recommend.ts`：新增匿名用户冷启动多样性补偿。`RecommendInput` 新增可选 `recentExposure`（前端记录的上次推荐 placeId/title），匿名用户命中项施加轻量 `exposurePenalty`（itemId 命中 8 分、routeTitle 命中 4 分），避免反复看到相同 Top 路线。复用画像 exposure 判定逻辑，不破坏"空画像=中性50"不变量。
  - `route-builder.ts`：`candidateScore` 权重 0.43→0.50，保持 route 组分中 candidate 质量的主导地位（归一化后 adjustedScore 量纲下降需同步）。

- **阶段 3：召回质量与画像维度增强**
  - `user-profile-v2.ts`：激活 area 维度。新增 `contextArea` 辅助函数，`recomputeUserProfile` 从 `interaction.context.area` 提取 area 偏好；新增 `singleBucketAffinity` 计算 area 独立 affinity；`calculateUserAffinityFromProfile` 加入 area 贡献项（系数 12，低于 tag 32/source 20，因 area 更粗粒度）。
  - `route-builder.ts` + `types.ts` + `feedback.ts`：`RecommendedRoute.places` 新增 `area?` 字段，route 序列化保留 area，feedback mirror 写入 `context.area`，打通 area 维度数据闭环。
  - `candidates.ts`：`trendScore >= 70` 抽为命名常量 `SOCIAL_CHANNEL_TREND_THRESHOLD`，`similarity > 0.08` 抽为 `TEXT_RECALL_SIMILARITY_THRESHOLD`，消除 magic number。

- 新增测试：
  - `tests/recommendation-weights.test.ts`（7 例）：正权重和=1.00、负权重稳定、满分/中性/零分映射、惩罚扣减、归一化后区分度提升。
  - `tests/recommendation-coldstart.test.ts`（6 例）：匿名无 exposure=0、itemIds 命中=8、routeTitles 命中=4、未命中=0、空数组=0、冷启动多样性排序。

- 验证：`pnpm typecheck` ✅、`pnpm test` ✅（192 pass / 0 fail）。

不变量保持（未被破坏）：
- `ranker="weighted-v1"` / `rankerVersion="weighted-v1.2-profile"` 不变。
- 空画像 → affinity=50, penalty=0, exposure=0（匿名 exposure 是新增独立逻辑）。
- XHS 永不 route-eligible；generic listicle 不进路线；路线无重复/跨主题混合。
- authorized-taste 隐私约束（titleDigest=60、tags≤10×40、sourceItemId 仅哈希）。

回滚方案：权重值集中在 `WEIGHTED_RANKER_WEIGHTS` 单一常量；trendScore 回写为单行删除（可恢复）；area 维度为增量新增（移除 `contextArea` 调用即回退中性）；匿名 exposure 由 `recentExposure` 字段控制（不传即等价改造前）。

## P1：强力提升产品说服力

### TASK2-P1-001：朋友式城市提醒卡

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及 LLM 推荐表达和首页信息架构。

背景与现状：

- 当前首页是地图优先的路线工作台，适合展示技术闭环。
- 但产品愿景更像一个懂用户的朋友主动给建议，而不是让用户读完一组工程指标。

目标：

- 在首页和路线详情中增加“城市提醒卡”，把 Top route 表达成一句自然、有时机感、可行动的建议。
- 表达必须绑定事实，不允许 LLM 编造地点、活动、剩余时间、天气或来源。
- 保留专业工具视图，但把第一感受从“路线分析”变成“现在可以这样出门”。

范围：

- 新增 `MomentRecommendationCard` 或类似组件。
- 输入来自：
  - 用户画像 top factors。
  - `RouteMomentFit`。
  - 高德 ETA 和分段路线。
  - 城市状态快照。
  - 来源信号可信度。
- LLM 输出使用结构化 JSON，例如：

```ts
type MomentCardCopy = {
  headline: string
  message: string
  primaryReason: string
  timingHint?: string
  nextAction: string
  citedPlaceIds: string[]
  citedSignalIds: string[]
  citedConditionSnapshotIds: string[]
}
```

UI 建议：

- 首页地图上方或右侧 inspector 顶部展示当前选中路线的提醒卡。
- 语气类似：“你关注的独立书店附近今晚有漫画展，路上 22 分钟，展览还来得及。”
- 不做营销 hero，不遮挡地图和路线操作。
- 卡片下方提供“为什么推荐给我”和“证据”入口，连接可信度展示。

验收标准：

- Top route 至少生成一条事实绑定的城市提醒卡。
- LLM 输出必须引用返回路线中的地点、来源信号和状态快照；校验失败回退本地模板。
- 没有画像或城市状态时，提醒卡仍能基于路线事实生成，但不假装“懂你”。
- 用户能从提醒卡一眼知道：去哪、为什么现在去、怎么去、推荐理由来自哪里。
- 桌面和移动端无文字溢出，不影响原地图工作台操作。

风险与降级：

- 过度拟人化容易显得虚假：只使用温和、具体、事实化表达。
- LLM 可能生成未经证实的信息：必须保留 citation 校验和本地模板降级。
- 工具视图仍需要保留：提醒卡是入口，不替代路线详情和来源证据。

### TASK2-P1-002：城市信号可信度显性化

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及信号解释、来源展示和可能的数据契约调整。

背景与现状：

- 当前系统已有 `sourceSignals`、feature snapshot、city pulse 和来源入库记录。
- 但普通用户不一定能理解：
  - 哪些是高德确认地点。
  - 哪些是大麦真实活动。
  - 哪些只是小红书热度证据。
  - 哪些交通来自高德，哪些是估算。
  - 信号是否新鲜、是否过期、是否可信。

目标：

- 把城市信号拆成用户可理解的可信度证据。
- 让用户明确看到推荐不是商业榜单，也不是小红书热帖直接当地点。
- 让每条路线的核心地点和来源证据都能解释清楚。

范围：

- 定义统一证据模型：

```ts
type RouteEvidence = {
  placeVerification: {
    placeId: string
    status: "amap_confirmed" | "event_venue_matched" | "estimated" | "unknown"
    source: string
    confidence: number
  }[]
  sourceFreshness: {
    source: string
    capturedAt?: string
    ageMinutes?: number
    status: "fresh" | "stale" | "unknown"
  }[]
  signalRoles: {
    source: string
    role: "place_authority" | "event_authority" | "trend_evidence" | "traffic_evidence" | "weather_evidence"
    description: string
  }[]
  caveats: string[]
}
```

- 在 `RouteInspector`、路线详情页和 CityPulse 中展示：
  - 地点是否高德确认。
  - 活动是否来自大麦/政务/其他真实活动源。
  - 小红书是否仅作为趋势证据。
  - 高德 ETA 与估算降级状态。
  - 来源更新时间和信号新鲜度。
- Admin source 页面补充 source 健康状态和最近成功入库时间。

验收标准：

- 每条路线都能展示至少一种可信度证据。
- 小红书信号明确标记为“趋势证据”，不展示成地点权威。
- 高德确认地点、大麦活动、高德 ETA、估算交通分别有不同可见状态。
- 过期或低置信度信号不会被包装成强证据。
- 用户不需要理解 feature snapshot，也能看懂推荐依据。

风险与降级：

- 证据太多会压垮 UI：默认展示摘要，详情用展开面板。
- 信号状态可能不完整：缺失时显示未知，不硬凑可信度。
- 不应暴露隐私或敏感 raw payload：只展示来源名、时间、角色和摘要。

### TASK2-P1-003：城市状态与来源健康看板

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：否，除非新增外部依赖或数据库结构。

目标：

- 给开发者和 Demo 演示者一个判断数据是否“活着”的入口。
- 避免城市状态、source adapter、normalize worker 静默失败。

范围：

- 扩展 `/admin/sources`：
  - 最近采集成功时间。
  - raw 待解析数量。
  - normalize worker 最近处理时间。
  - 城市状态快照数量和最新刷新时间。
  - 大麦/小红书/高德等 connector 的人工验证状态。
- 增加 smoke checklist 文档或脚本。

验收标准：

- 可以快速判断当前城市数据是否新鲜。
- 可以看到哪个 source 失败、是否需要验证码或 key。
- 可以看到待处理 raw item 数量，避免采集成功但推荐没变化。

## P2：后续产品化

### TASK2-P2-001：完整 MCP / OAuth 授权连接器

- 状态：`待审批`
- 来源：承接 `TASK-P2-001：MCP Connector 抽象`。

目标：

- 让小红书、豆瓣、B 站等授权用户数据以合规方式进入用户画像。
- 管理授权状态、token 生命周期、撤销授权和最小化数据使用。

暂不作为第一批实现原因：

- 授权系统和隐私边界复杂。
- 可以先用 `AuthorizedTasteImport` 契约定义画像输入格式。
- 站内反馈画像已经能先证明“长期懂你”的产品价值。

### TASK2-P2-002：主动通知与订阅

- 状态：`待审批`

目标：

- 当城市状态和用户画像稳定后，再做“有合适活动时主动提醒”。

暂不作为第一批实现原因：

- 推送通知需要账号、权限、频控、退订和打扰控制。
- 在推荐准确性和可信度稳定前，主动推送容易伤害信任。

### TASK2-P2-003：语义召回与向量画像

- 状态：`待审批`

目标：

- 在确定性画像和规则 ranker 稳定后，引入 pgvector / embedding 做语义召回。

暂不作为第一批实现原因：

- 当前更缺产品闭环和可信信号，不是缺模型复杂度。
- embedding 涉及费用、隐私和评估，需要单独审批。

## 建议实施顺序

1. `TASK2-P0-001A`：先用站内反馈和推荐日志做用户画像，成本低、收益直接。
2. `TASK2-P0-001B/C/D`：把画像接入推荐、解释和清空能力，形成完整闭环。
3. `TASK2-P0-002A/B`：建立城市状态快照和天气能力，让“城市呼吸”有第一层事实。
4. `TASK2-P0-002C/D/E`：补人流估算、情绪热力和推荐接入。
5. `TASK2-P0-003`：加入此刻可执行判断，为“还有 2 小时结束、现在出发”提供事实。
6. `TASK2-P1-001`：做朋友式城市提醒卡，把能力变成用户第一眼能感知的产品体验。
7. `TASK2-P1-002`：做可信度显性化，解释为什么推荐不是商业榜单。
8. `TASK2-P1-003`：补健康看板，降低 Demo 和后续运维风险。

## 当前审批队列

- [x] 审查并批准 `TASK2-P0-001：用户品味画像闭环`（2026-06-14，angjustinl）；已完成实现并通过 typecheck/lint/test（build 失败为 main 既有预渲染问题，与本次改动无关）。
- [x] 审查并批准 `TASK2-P0-004：推荐算法权重归一化与冷启动优化`（2026-06-15）；已完成实现，正权重之和 1.34→1.00，修复 trendScore 双重计数，激活 area 维度，新增匿名冷启动 exposure，通过 typecheck/test（192 pass / 0 fail）。
- [ ] 审查并批准 `TASK2-P0-002：实时城市状态 V0`。
- [ ] 审查并批准 `TASK2-P0-003：此刻可执行判断与时机感`。
- [ ] 审查并批准 `TASK2-P1-001：朋友式城市提醒卡`。
- [ ] 审查并批准 `TASK2-P1-002：城市信号可信度显性化`。
- [ ] 审查并批准 `TASK2-P1-003：城市状态与来源健康看板`。

## 本阶段不建议优先做

- 不建议马上引入完整机器学习推荐框架。
- 不建议先做协同过滤或 learning-to-rank。
- 不建议先做主动推送。
- 不建议把小红书、豆瓣、B 站原始私密数据长期保存。
- 不建议让 LLM 直接决定用户画像或推荐排序。
- 不建议把估算人流包装成真实客流。

## 变更记录

- 2026-06-14：创建 `tasks-2.md`，将用户画像、实时城市状态、朋友式表达和信号可信度作为真实 MVP 补齐方向。
- 2026-06-14：批准 `TASK2-P0-001：用户品味画像闭环`（angjustinl）。审批结论增加四项实现约束：feedback 去重、分层负偏好（≥2 样本/更快衰减/硬上限）、权重调整与无画像回退、E 仅做授权导入契约与脱敏 mapper。
- 2026-06-14：完成 `TASK2-P0-001：用户品味画像闭环` 实现（A→E），通过 typecheck/lint/test；build 失败定位为 main 既有 Next.js 预渲染问题。
- 2026-06-15：批准并完成 `TASK2-P0-004：推荐算法权重归一化与冷启动优化`。正权重之和 1.34→1.00（userAffinity 0.35→0.18）；修复 trendScore 双重计数（移除 signal-fusion trendScore 回写）；激活 area 画像维度（从 interaction.context.area 提取）；新增匿名用户冷启动 exposure（recentExposure 参数）；文本召回阈值 0.03→0.08；抽取共享 feedback-weights 常量；新增 13 个测试（recommendation-weights / recommendation-coldstart）。通过 typecheck/test（192 pass / 0 fail）。
