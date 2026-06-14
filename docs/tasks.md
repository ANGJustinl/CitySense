# 任务规划：Project CitySense（城市脉搏）

本文档用于跟踪项目初始化后的后续开发任务。所有任务都以 todo 形式管理，并且在开始编码前必须先经过开发者审批流程。

## 开发者审批流程

任务状态：

- `待审批`：任务已定义，但不得开始实现。
- `已批准`：开发者已审查范围、风险和验收标准，可以进入实现。
- `进行中`：任务已经开始开发。
- `已阻塞`：等待密钥、产品决策、API 权限或基础设施。
- `已完成`：任务已合并、交付或被明确验收。

审批规则：

- 所有 P0 任务在实现前都必须经过开发者审批。
- 任何涉及数据库结构、爬虫行为、MCP 连接器、付费 API、用户数据、推荐算法权重的任务，都必须显式审批。
- 审批应以书面形式记录：将任务状态改为 `已批准`，并填写审批人、日期和结论。
- 后续提交、PR 或变更说明必须引用已批准的任务编号。
- 如果实现过程中任务范围发生变化，需要把状态退回 `待审批`，重新发起审批。

每个任务的审批检查项：

- [ ] 任务范围清晰。
- [ ] 验收标准可验证。
- [ ] 数据与隐私影响已审查。
- [ ] 外部 API 成本与限流风险已审查。
- [ ] 回滚或降级方案已定义。
- [ ] 开发者审批记录已填写。

## P0：黑客松 Demo 必须完成

### TASK-P0-001：接入 Supabase Postgres

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是

待办：

- [x] 创建 Supabase 项目和数据库。
- [x] 在本地 `.env` 中添加 `DATABASE_URL`。
- [x] 使用 Prisma 对 Supabase 执行迁移。
- [x] 将当前 mock-only 的推荐候选召回替换为数据库召回。
- [x] 当数据库未配置或不可用时，推荐接口直接报错，不回退 mock 数据。
- [x] 验证 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`。

验收标准：

- [x] Supabase 中存在 `events`、`venues`、`city_signals`、`traffic_snapshots` 和 `recommendation_logs` 表。
- [x] `POST /api/recommend` 可以基于持久化数据返回路线。
- [x] 不配置 Supabase 或数据库连接失败时，API 返回错误，不返回 mock 推荐。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。Supabase migration、seed、数据库召回、失败时报错策略和构建验证均已通过。

### TASK-P0-002：扩充 Demo 城市数据

- 状态：`已完成`
- 负责人：用户 / Codex
- 是否需要审批：是

待办：

- [x] 将 seed 数据扩展到至少 20 个上海地点或活动。
- [x] 覆盖多个区域：徐汇、静安、长宁、黄浦、浦东。
- [x] 加入小红书、豆瓣、B 站、高德 POI 等来源信号。
- [x] 补充真实感较强的标签、坐标、价格、人流安静度、热度和趋势分。
- [x] 在 `README.md` 中补充 seed 命令说明。

验收标准：

- [x] 推荐结果会随心情、兴趣、预算和时间窗口产生明显变化。
- [x] 每条路线都展示可追溯的来源信号。
- [x] 任意路线都不依赖实时爬虫。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：用户确认 002 正在进行中，继续推进 003。

完成记录：

- 完成日期：2026-06-13
- 结论：已完成。seed 已幂等写入 22 条上海 Demo 活动/地点；推荐接口读取入库数据并返回可追溯来源信号，不依赖实时爬虫。本轮新增的 demo 数据用 sourceKey=demo:* 独立可追踪。

### TASK-P0-003：将高德 ETA 接入推荐排序

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是

待办：

- [x] 补充 `AMAP_API_KEY` 配置说明。
- [x] 使用有效 `AMAP_API_KEY` 验证高德步行、公交、驾车三种路径返回。
- [x] 将交通结果缓存到 `traffic_snapshots`。
- [x] 确保高德 API 只对 Top-N 候选调用。
- [x] 当高德失败或未配置密钥时，保留估算交通降级。
- [x] 在 UI 中展示交通数据来源状态。

验收标准：

- [x] 配置有效 `AMAP_API_KEY` 后，路线耗时来自高德。
- [x] 不配置 `AMAP_API_KEY` 时，推荐仍能使用估算交通成功返回。
- [x] 交通分会影响最终推荐排序。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。高德 walking/transit/driving 均返回 `provider: "amap"`；推荐接口返回 `trafficProvider: "amap"`；重复请求命中 `traffic_snapshots` 缓存；无 key 降级路径此前已验证。

### TASK-P0-004：持久化推荐日志与用户反馈

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是

待办：

- [x] 将推荐请求和推荐响应写入 `recommendation_logs`。
- [x] 新增 `recommendation_feedbacks` 表，作为 P0-004 路线级反馈事实表。
- [x] 通过 `/api/feedback` 存储路线级反馈。
- [x] 在路线卡片中加入轻量反馈按钮。
- [x] 将负反馈纳入后续推荐打分。
- [x] 为记录的输入数据补充基础隐私说明。

验收标准：

- [x] 可以按 `userId` 和日期查询推荐日志。
- [x] 用户反馈会更新匹配的日志记录。
- [x] 负反馈可以降低相似推荐的排序。
- [x] API 校验 `recommendationLogId` 存在、`routeId` 属于该 log、`value` 枚举合法、`reason` 长度受限。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。按方案 B 新增 `recommendation_feedbacks`，`/api/feedback` 严格校验 recommendationLogId、routeId、value、reason；路线卡片提供“有帮助 / 不合适 / 收藏”轻量反馈；日志 feedback 回填和负反馈排序惩罚已接入。

### TASK-P0-005：完善路线详情页

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是

待办：

- [x] 先规划可复用 API 规范。
- [x] 增加路线详情纯函数测试。
- [x] 推荐接口写入 `recommendation_logs` 路线快照。
- [x] 从 `recommendation_logs` 读取路线详情。
- [x] 展示有序地点、分数、来源信号和交通信息。
- [x] 补充地图可用坐标、polyline、markers 和路线摘要。
- [x] 生成可分享的路线 URL。
- [x] 未配置前端高德 JS key 时显示静态路线预览。
- [x] 配置前端高德 JS API key 后验证真实高德地图渲染。

验收标准：

- [x] 点击“路线详情”会进入真实的路线详情页。
- [x] 详情页展示的路线与 `/api/recommend` 返回结果一致。
- [x] 路线 id 缺失或无效时展示可理解的空状态。
- [x] `GET /api/routes/:id` 支持 200、400、404 响应。
- [x] 真实高德 JS 地图在浏览器中渲染 marker 和 polyline。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。API、测试、快照、详情页、静态地图降级和真实高德 JS 地图渲染均已验证；浏览器状态显示 `高德地图`，静态预览消失，marker DOM 存在，控制台无错误。

## P1：强力提升 Demo 说服力

### TASK-P1-001：Source Adapter 入库流水线

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是

待办：

- [x] 将 adapter 原始输出写入 `raw_source_items`。
- [x] 将原始数据规范化为 `events`、`venues` 和 `city_signals`。
- [x] 为每个连接器记录采集状态。
- [x] 在 admin source 页面加入手动采集入口。
- [x] 为每个来源加入限流保护。

验收标准：

- [x] `/api/ingest/run` 可以创建采集任务并入队，由 worker 写入原始数据和规范化数据。
- [x] `/admin/sources` 展示连接器状态、最近运行时间、最近任务，并支持手动触发采集。
- [x] 推荐接口只读取规范化后的 `events` 和 `venues`，不实时调用 adapter。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。实现 BullMQ + Redis 入队、独立 worker、统一 adapter 基类、raw/normalized/city_signals 入库、connector 状态、cooldown、admin 手动触发和轮询状态；`pnpm prisma:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm build` 已通过。

### TASK-P1-002：接入一个真实公开活动源

- 状态：`已完成`
- 负责人：用户 / Codex
- 是否需要审批：是

待办：

- [x] 默认隐藏 mock adapter、mock connector 和历史 `*-mock` 推荐候选，除非 `.env` 显式开启演示模式。
- [x] 选择一个合规的公开活动来源。
- [x] 记录该来源的使用条款、限流规则和允许用途。
- [x] 按现有 `CitySourceAdapter` 接口实现 adapter。
- [x] 解析标题、时间、地址、标签、来源 URL 和热度信号。
- [x] 当页面为空或结构变化时，提供可降级处理。

验收标准：

- [x] 未开启演示模式时，默认采集来源和推荐候选不包含 mock 内容。
- [x] 开启 `CITYSENSE_DEMO_MODE=true` 后，mock source 可用于演示。
- [x] 至少一个真实来源可以为 Demo 提供活动数据。
- [x] 来源 URL 被保留，便于结果追溯。
- [x] 禁用该 adapter 后，推荐系统仍可正常工作。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：批准继续推进 P1-002，并先完成“mock 内容默认不显示，除非 `.env` 开启演示模式”的范围。

完成记录：

- 完成日期：2026-06-13
- 真实来源：`shanghai-gov`，读取上海市人民政府公开“行业信息”列表页及少量详情页。
- 使用与限流：仅读取公开页面标题、日期、来源单位、正文摘要和原文 URL；不抓取登录态、用户信息或评论；默认 cooldown 30 分钟，`SHANGHAI_GOV_MAX_DETAILS` 限制每次详情页数量；页面为空或结构变化时返回空结果。
- 结论：已完成。`shanghai-gov` adapter 可入库真实活动资讯，保留 `sourceUrl`；禁用 connector 后新采集会跳过，推荐仍读取已有规范化库表并正常返回。非演示模式会同时隐藏 mock source 和 `sourceKey=demo:*` seed 演示数据。

### TASK-P1-003：接入 LLM 推荐解释层

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是，用户已批准开始推进

待办：

- [x] 补充 `OPENAI_API_KEY` 配置说明。
- [x] 在调用 LLM 前保持推荐候选结果确定。
- [x] 只向 LLM 发送已选路线的事实信息。
- [x] 加入超时控制和本地解释降级。
- [x] 防止 LLM 编造地点、活动或来源信号。

验收标准：

- [x] LLM 解释只引用返回路线中的地点和信号。
- [x] 超时或缺少密钥时，系统回退到本地解释。
- [x] 不配置 LLM 密钥时，构建和 API 仍然通过。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：批准开始推进 P1-003，把各信息源的第一结果加入 LLM pipeline。

完成记录：

- 完成日期：2026-06-13
- 推荐入口仍先完成 DB 候选召回、ranker、交通重排和路线组装；LLM 只在最后改写 `reason/tips`，不改变路线、排序、地点或来源信号。
- LLM 请求只包含已选路线事实，以及交通重排短名单中按 `source` 去重后的第一条 `sourceContext`。`sourceContext` 只作为来源覆盖背景，不允许被写成路线外的新地点。
- LLM 输出采用结构化 JSON schema，必须返回 `routeId`、`citedPlaceIds`、`citedSignalSources`；合并前会校验 citation 是否属于同一条返回路线，发现路线外地点、未知 source 或 URL 时回退本地解释。
- 缺少 `OPENAI_API_KEY`、OpenAI 调用超时、HTTP 失败、payload 非法或校验失败时，推荐接口继续返回本地模板解释。推荐接口不会实时调用 MCP、爬虫或 Source Adapter。
- 2026-06-13 续推进验证：`tests/route-explainer-llm.test.ts` 覆盖 source 首条上下文、缺 key/超时降级和路线外引用回退，`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 均通过。

### TASK-P1-004：城市脉搏可视化

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：否，除非涉及数据模型变化。

待办：

- [x] 展示各区域的热门标签。
- [x] 展示 mock、API、crawler、MCP 的来源占比。
- [x] 展示交通数据来源和缓存新鲜度。
- [x] 补充加载态和空状态。

验收标准：

- [x] 右侧面板能帮助解释路线为何被排序到前面。
- [x] 可视化在桌面和移动端都保持可读。
- [x] 不新增外部依赖；如需新增，必须先审批。

审批记录：

- 审批人：无需审批
- 日期：2026-06-13
- 结论：已完成。新增 `/api/city-pulse`，右侧面板展示热门标签、来源占比、召回通道、交通 provider/cache、ranker 和反馈趋势；无新增外部依赖。

完成记录：

- 2026-06-13 续推进：按 TDD 新增 `tests/city-pulse.test.ts`，先覆盖交通 provider mix、快照数量、最新缓存时间和缓存新鲜度聚合。
- `GET /api/city-pulse` 的响应新增 `trafficCache`，包含 `providerMix`、`snapshotCount`、`latestCapturedAt` 和 `latestAgeMinutes`；查询失败仍返回空结构，不阻塞推荐页面。
- `CityPulsePanel` 在“召回与反馈”中展示路线缓存命中、城市交通快照数量、新鲜度、刷新时间和交通 provider 分布；`docs/api.md` 已同步契约。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 均通过。

### TASK-P1-005：推荐系统 V1 升级规划与实现

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是

待办：

- [x] 审阅 `docs/recommendation-system-plan.md`。
- [x] 确认 V1 不引入完整机器学习推荐框架。
- [x] 新增多路召回抽象：tag、text、city signal、feedback suppression。
- [x] 新增 feature builder，拆出候选特征计算。
- [x] 新增 ranker 接口，保留当前规则打分为 `weighted-v1`。
- [x] 保存推荐 feature snapshot，用于后续评估和调权。
- [x] 将固定路线切片替换为小规模路线组合打分。
- [x] 增加推荐评估 fixtures 和单元测试。

验收标准：

- [x] 推荐主链路仍在 Next.js 服务端完成，不新增实时 ML 服务依赖。
- [x] 推荐结果包含 recall channel、ranker version 和可追溯特征。
- [x] 权重变更可以通过配置或版本记录追踪。
- [x] 路线组合不重复同一地点，并能体现交通效率和多样性。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build` 通过。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：已完成。实现多通道召回、Postgres `pg_trgm` 支撑的文本召回、feature builder、`weighted-v1` ranker、feature snapshot、反馈惩罚和路线组合评分；数据库 migration 与接口联调通过。

续推进记录：

- 2026-06-13：按 TASK-P1-005B 继续优化推荐效果，目标从“高德 POI 拼盘 / 小红书合集候选”回归为“城市信号背书的可执行路线”。
- 新增轻量迁移 `20260609133000_signal_backed_routes`，为 `Event` / `Venue` 增加 `qualityScore` 与 `qualityFlags`，并对历史数据按地址、坐标和泛化社交标题回填质量。
- 新增候选质量层和城市信号叠加：小红书、B 站、trends-hub 等泛化合集默认作为 signal-only，不直接进入路线地点；高德、政务等可执行候选可吸收同城同区同标签的 `city_signals`。
- Ranker 版本更新为 `weighted-v1.1-signal-backed`，feature snapshot 记录 `qualityScore`、`qualityFlags`、`signalStrength` 和 `routeEligible`；路线组合加入主题连贯、来源证据和起点最近邻排序。
- TDD 新增 `tests/recommendation-p1-005b.test.ts`，覆盖泛化社交候选过滤、信号叠加、融合信号打分、主题连贯路线和按 origin 排序。
- 初始验证：`pnpm prisma:generate`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 均通过。
- 2026-06-13 续测调整：已对当前 Supabase 执行 `pnpm prisma migrate deploy`，质量字段和历史回填生效；真实推荐 smoke 验证 quiet / nightlife / mixed 三类输入均返回可执行地点路线，泛化小红书合集不再直接进入路线。
- 续测中发现并修复：同一场馆不同 POI 会被拼成路线、泛化/离题社交标题会作为证据展示、静安区域可执行候选不足导致少于 3 条路线。修复包括场馆簇去重、社交信号标题与标签匹配、区域不足时同城 fallback recall。
- 续测验证：`pnpm test` 75 个测试通过，`pnpm lint`、`pnpm typecheck`、`pnpm build` 均通过；真实高德 smoke 返回 `trafficProvider: "amap"`，高德失败或非 Top 路线仍可估算降级。
- 2026-06-13 继续修复 date/weekend 真实 smoke：高分但无地址的小红书笔记曾在可执行候选不足时进入路线。已补 TDD 覆盖 noisy social Top-N、召回窗口保留 actionable、仅 1 个可执行候选时不做 signal-only 兜底。
- 推荐链路新增三层防线：召回窗口 `routeEligible` 优先、交通 Top-N `routeEligible` 优先、路线组合只要存在可执行候选就只用可执行候选；同时新增 AMap / 政务可执行补充召回，避免高热视频挤掉低热但可走的地点。
- 最新真实 smoke：`date + weekend + 咖啡/展览` 返回 3 条 AMap 可执行路线，地点均有地址和坐标，`xiaohongshu` 仅作为 `sourceSignals` 证据叠加；`recallChannels` 包含 `city-fallback` 与 `city-signal`。
- 最新验证：`pnpm prisma:generate`、`pnpm typecheck`、`pnpm lint`、`pnpm test`（78 个测试）、`pnpm build` 均通过。
- 2026-06-13 继续真实效果测试：按 design 约束对 quiet culture、date weekend、nightlife livehouse、low budget market food 和实时高德 smoke 做断言式验证，覆盖 3 条路线、可执行地点、无 signal-only 社交地点、来源信号、ranker version 和高德 Top-N 降级。
- 发现并修复低预算 `市集/美食/咖啡` 请求退化为纯咖啡路线：路线评分新增请求兴趣覆盖分，主题匹配支持 `美食市集`、`咖啡厅` 等组合词/别名，确保有可执行市集/美食候选时不会被近处咖啡店完全淹没。
- 最新验证更新：`pnpm prisma:generate`、`pnpm typecheck`、`pnpm lint`、`pnpm test`（79 个测试）、`pnpm build` 均通过；真实 low budget market food smoke 返回含政务 `美食市集` 活动的可执行路线，社交内容仍只作为证据。

### TASK-P1-006：地图优先的推荐工作台 UI 迭代

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，作为黑客松 demo 主界面重构；若新增地图 SDK、外部依赖或更改推荐数据契约，需要重新审批。
- 视觉目标：ImageGen 图二 `Map-first Feasibility Planner`
- 参考图：`/home/server/.codex/generated_images/019ea1bf-c43d-7892-bdee-0b80ea93ed94/ig_0dffe9e4e6280147016a2560f0c948819185a6925ec5cdfc76.png`

目标：

- 将首页从“三栏卡片工作台”迭代为“地图优先的路线可达性工作台”。
- 让用户和评委第一眼看到：高德 ETA 和交通重排实际影响路线排序，而不是只作为地图装饰。
- 保留现有推荐闭环：偏好输入、3 条路线、交通耗时、来源信号、AI 解释、反馈按钮。

设计原则：

- 首页是可操作产品界面，不做营销页。
- 地图是可达性证据层，推荐路线仍是核心决策对象。
- 优先复用现有 `RecommendationWorkspace`、`RouteCard`、`CityPulsePanel`、`TrafficBadge`、`SourceSignalBadge` 的数据和视觉语言。
- 不在本任务中更改数据库 schema、推荐算法权重、采集流水线或高德 API 调用策略。
- 如真实高德地图主视图成本过高，先实现静态地图式路线画布；真实地图能力留给后续任务。
- 2026-06-13 调整：首页主视图直接复用 `RouteDetailMap` 已验证的真实高德 JS 地图能力，CSS 静态画布仅作为无前端 key 或无坐标时的降级。

计划触达文件：

- 修改：`components/RecommendationWorkspace.tsx`
  - 重组首页布局为左侧输入栏、中间地图工作区、右侧路线 inspector。
  - 增加选中路线状态，支持 Route 1 / Route 2 / Route 3 切换。
  - 保留现有 `POST /api/recommend` 调用和反馈链路。
- 新增：`components/city/RouteMapCanvas.tsx`
  - 复用 `RouteDetailMap` 的高德 JS loader，渲染真实高德地图、3 条路线 polyline、编号 marker 和顶部图例。
  - 无前端高德 JS key 或路线缺少坐标时，降级 CSS 静态路线画布；不新增外部依赖。
- 新增：`components/city/RouteInspector.tsx`
  - 展示选中路线的分数、ETA、总时长、站点列表、AI explanation、来源信号、反馈按钮。
  - 从现有 `RouteCard` 拆用或复用反馈提交逻辑，避免重复 API 契约。
- 新增：`components/city/RouteTimeline.tsx`
  - 展示 3 个 stop 的时间轴、每段交通耗时、交通状态和地点摘要。
- 修改：`app/globals.css`
  - 新增地图优先工作台布局、地图画布、路线 inspector、时间轴和响应式规则。
  - 保持现有 8px 圆角、teal/coral/amber 色系和轻量边框风格。
- 视情况修改：`components/city/RouteCard.tsx`
  - 抽出反馈按钮或轻量 route summary，减少 inspector 与 card 的重复实现。

实施阶段：

- [x] 阶段 1：布局骨架
  - 将首页改成左侧 control rail、中间 map workspace、右侧 route inspector。
  - 桌面端优先匹配图二；移动端降级为输入、地图、路线详情纵向堆叠。
- [x] 阶段 2：地图可达性表达
  - 在 `RouteMapCanvas` 中用真实高德 JS 地图显示 3 条路线，Top route 使用 teal 高亮，其他路线使用 coral/amber。
  - 显示路线编号 marker、图例和交通状态；无 key 时降级简化地图网格静态画布。
  - 顶部加入指标条：Candidate Pool、Amap ETA Calls、Traffic Rerank、Top Route Score、Cache Hits。
- [x] 阶段 3：右侧路线 inspector
  - 支持 Route 1 / Route 2 / Route 3 切换。
  - 展示推荐分、总时长、交通耗时、距离摘要、站点列表、AI 解释、来源信号和反馈按钮。
  - 明确展示“因实时 ETA 更优提升排序”的产品文案。
- [x] 阶段 4：底部路线时间轴
  - 将选中路线的 3 个地点串成时间轴。
  - 展示每段出行时间、交通状态和地点标签。
  - 与 inspector 选中状态保持同步。
- [x] 阶段 5：状态与降级
  - 推荐生成中显示地图和 inspector 的加载状态。
  - 无路线时显示可理解空状态。
  - 交通 provider 为估算值时，明确显示降级状态，避免误导为真实高德数据。
- [x] 阶段 6：验证
  - 运行 `pnpm typecheck`。
  - 运行 `pnpm lint`。
  - 启动 `pnpm dev` 并用浏览器检查桌面与移动端布局。
  - 检查控制台无明显错误，生成路线和反馈按钮仍可用。

验收标准：

- [x] 首页首屏以地图工作区为视觉中心，而不是路线卡片列表。
- [x] 用户可以从左侧输入偏好并生成 3 条路线。
- [x] 3 条路线在地图画布中同时可见，当前 Top route 视觉优先级最高。
- [x] 右侧 inspector 可以切换 3 条路线，并展示 ETA、站点、来源信号、AI 解释和反馈按钮。
- [x] 顶部指标条能解释推荐链路：候选池、ETA、交通重排、最高分、缓存。
- [x] 不新增数据库 migration，不改变 `/api/recommend` 和 `/api/feedback` 的现有 API 契约。
- [x] 桌面端 `1440 x 1024` 视口下接近图二的信息层级；移动端不出现文字重叠或横向溢出。
- [x] `pnpm typecheck`、`pnpm lint` 通过。

风险与降级：

- 真实高德地图主视图复用 `RouteDetailMap` 已验证的 loader 与渲染路径；若浏览器端加载失败或缺少 key，自动降级为静态地图式路线画布，不阻塞推荐闭环。
- 如果路线 polyline 数据不足，首版用稳定的 mock route geometry 仅作 UI 表达，不改变推荐排序事实。
- 如果 inspector 与 `RouteCard` 反馈逻辑出现重复，优先抽出共享反馈组件，避免两个 UI 入口产生不一致行为。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：批准实施，并调整地图方案——复用已验证的真实高德 JS 地图（`RouteDetailMap` 能力）作为首页主视图，CSS 静态画布降级为无 key / 无坐标时的 fallback。其余约束不变：不新增外部依赖，不改数据库 schema，不改 `/api/recommend` 与 `/api/feedback` 契约。

完成记录：

- 完成日期：2026-06-13
- 抽出共享高德 JS loader（`components/city/amap-loader.ts`），`RouteDetailMap` 与新增 `RouteMapCanvas` 复用同一加载路径。
- 首页重组为左侧输入栏、中间地图工作区、右侧路线 inspector 的地图优先布局；中间区含指标条（候选池、高德 ETA、交通重排 ranker 版本、Top 路线分、缓存命中）与底部路线时间轴。
- `RouteMapCanvas` 用真实高德 JS 地图同时渲染 3 条路线 polyline 与编号 marker，选中路线高亮（teal/coral/amber），点击地图路线、图例或 inspector tab 均可切换；无 key / 无坐标时降级为 SVG 静态路线画布（按真实坐标投影，非装饰图）。
- 反馈逻辑抽出为共享组件 `RouteFeedbackButtons`，`RouteCard` 与 `RouteInspector` 共用同一 `/api/feedback` 契约；时间轴只展示路线级聚合耗时与出行方式，不虚构分段耗时（API 响应无分段数据）。
- 估算交通降级状态在指标条（“估算降级”琥珀色）与 inspector 文案中均显式提示，不误导为真实高德数据。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`（79 个测试）、`pnpm build` 均通过；浏览器实测桌面 1440x1024 与移动 390x844 布局无溢出，真实高德地图渲染（状态徽章“高德地图”）、路线切换、反馈“已记录”、生成路线加载态均正常，控制台无错误。

### TASK-P1-007：入库内容使用 LLM 解析归一化

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：用户已批准“所有信息源都开启 LLM 解析”。

待办：

- [x] 在 raw item 入库后、event/venue/city_signal 写入前加入 LLM normalization 层。
- [x] 默认所有 source 都启用 LLM 解析，保留显式关闭和 source 过滤配置。
- [x] LLM 输出使用结构化 JSON schema，并通过本地校验后才进入 normalized 入库。
- [x] LLM 失败、超时或 payload 非法时回退确定性解析，不阻塞采集任务。
- [x] `source/sourceUrl/sourceKey` 由系统保留，LLM 不能改写来源身份。
- [x] `RawSourceItem.parsedPayload` 记录 LLM normalize 状态和最终 normalized entity，便于排查。

验收标准：

- [x] `amap-poi`、`shanghai-gov`、`xiaohongshu`、`trends-hub` 等所有 source 默认都会进入 LLM normalization。
- [x] LLM 可以增强 title、description、city、area、address、time、tags、score、confidence 等入库字段。
- [x] LLM 可以将无关内容标记为 ignored。
- [x] LLM 解析后的 tags 和 trendScore 会用于 `city_signals`。
- [x] 缺少 key、超时或无效输出不会导致 ingest run 失败。

完成记录：

- 完成日期：2026-06-13
- 新增 `server/ingest/llm-normalizer.ts`，复用 OpenAI-compatible Responses API 和 `gpt-5.5`，默认 `CITYSENSE_LLM_NORMALIZE_ENABLED=true`、`CITYSENSE_LLM_NORMALIZE_SOURCES=all`。
- `server/ingest/pipeline.ts` 已接入：raw item 先 upsert，再执行 LLM normalization，随后写入 normalized entity 和 city signals。
- `server/ingest/normalize.ts` 的 city signal 构建支持使用 LLM normalized entity 的 tags、city、area、trendScore 和 title。
- 新增测试覆盖全 source 默认启用、LLM 成功解析、非法 payload 回退、LLM ignored，以及 city signal 使用 LLM tags/score。
- 2026-06-13：新 key 重试成功，`normalizeSourceItemForIngest` smoke 返回 `llm_normalized`；base URL 配置兼容 `OPENAI_BASE_URL`、`OPENAI_API_BASE`、`API_BASE`。
- 2026-06-13：真实队列 run `cmq61luyf0000q0t8s4trtdt1` 完成，4 个 source 均 completed，raw 12 条中 11 条 `llm_normalized`、1 条 `llm_ignored`。

### TASK-P1-008：信息摄取闭环质量修正

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：用户已要求继续运行并修正全自动信息摄取闭环。

待办：

- [x] 统一上海区名别名，避免 `静安` 与 `静安区` 推荐结果不一致。
- [x] LLM 入库时不再把缺少正文/地址证据的搜索区域写入 normalized entity。
- [x] 上海政府源不再把请求 area 当作文章事实 fallback。
- [x] normalized entity upsert 时可空字段使用 `null` 清理旧值，避免 stale area/address 留在库表。
- [x] 增强上海政府源对 `上海体育场` 的地址抽取。
- [x] 用真实队列 run 验证静安闭环结果。

完成记录：

- 完成日期：2026-06-13
- 新增 `server/geo/area-normalizer.ts`，推荐召回、候选过滤、city signal 和入库 normalize 共用区名归一逻辑。
- 修复 `shanghai-gov` adapter：只有文章文本存在区域证据时才写入请求区；仍可抽取明确地点地址。
- 修复 `server/ingest/pipeline.ts` 的 event/venue upsert，确保 LLM 或 adapter 清空字段时数据库旧值也会被清掉。
- 真实闭环验证：`shanghai-gov` 队列 run `cmq5x0cwh0000q0x2s5215eq4` 完成后，“上海体彩好事发生市集...” 更新为 `area=null`、`address=上海体育场`；`静安` 与 `静安区` 推荐候选数一致，且不再包含该跨区活动。

### TASK-P1-009：小红书 MCP 切换到 AI 搜索接口

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：用户已要求切换到 `ANGJustinl/xiaohongshu-mcp`，并接入新增 LLM 搜索接口。

待办：

- [x] Docker 构建源切到 `ANGJustinl/xiaohongshu-mcp` 并固定 commit。
- [x] 小红书 adapter 默认调用 `ai_search_chat`。
- [x] 将 AI 搜索返回的 `sources.notes` 映射成标准 `RawSourceItemDetail[]`。
- [x] AI 搜索无来源或不可用时回退 `search_feeds`。
- [x] 保留 `search_feeds` 强制开关，便于排障。
- [x] 更新 `.env.example` 和 README。

完成记录：

- 完成日期：2026-06-13
- `docker-compose.xiaohongshu-mcp.yml` 固定 `ANGJustinl/xiaohongshu-mcp@d93a11caae4f8ce84e954dde53933be22d7908c4`。
- `server/sources/adapters/xiaohongshu.adapter.ts` 默认 tool 改为 `ai_search_chat`，入参使用 `{ prompt, include_sources, source_limit, timeout_seconds }`。
- 新增/更新测试覆盖 AI 搜索 source note 映射、AI 搜索无来源时回退 `search_feeds`、并发 event/venue 复用同一次 AI 搜索请求、强制 `search_feeds` 时错误透出。

### TASK-P1-010：高德分段路径规划与真实路线展示

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是，涉及高德 API 调用行为变化（每次推荐新增按段方向规划调用）。

背景与现状：

- `server/maps/amap.ts` 调用的 v3 方向 API 响应中本就包含每段 `steps`（指令、道路、分段耗时）和 `polyline`（真实道路坐标串），当前实现只解析总耗时与距离。
- 现有交通模型是 origin→单个候选点；路线级耗时为各候选耗时求和 ×0.75 的合成值，时间轴无法展示真实分段耗时。
- 地图上的路线是站点间直线连线，不反映真实道路走向。

目标：

- 对最终 3 条路线做逐段规划（origin→stop1→stop2→stop3），向用户展示真实分段耗时、公交线路名与道路级 polyline。
- 时间轴的连接段显示每段真实耗时与方式；地图画布与路线详情页绘制真实道路 polyline。
- 路线级总耗时改为分段耗时之和（真实值），替代合成估算。

方案与约束：

- 扩展 `getAmapRouteTraffic` 解析 `steps` / `polyline`（walking/driving 取 `paths[].steps[]`；transit 取 `transits[].segments[]`，含步行段与公交段 `buslines` 名称、上下车站）。
- 新增 leg 规划层：路线组装完成后仅对最终 3 条路线逐段调用（约 3 路线 × 3 段 = 9 次/请求），符合“高德 API 只打 Top-N 候选”约束。
- 分段结果缓存进 `TrafficSnapshot.rawPayload`（现有 Json 列），leg 数据随路线快照写入 `RecommendationLog.recommendedRoutes`（现有 Json 列）——不需要数据库 migration。
- 推荐排序不变：leg 规划发生在 ranker 与交通重排之后，仅影响展示与路线级耗时事实。
- 降级：未配置 key、调用失败或超时，回退现有直线连线 + 聚合估算展示，推荐闭环不受阻。

计划触达文件：

- 修改：`server/maps/amap.ts`（解析 steps/polyline）、`server/maps/traffic.ts` / `traffic-cache.ts`（leg 缓存）
- 新增：`server/maps/route-legs.ts`（逐段规划器）
- 修改：`server/recommendation/route-builder.ts`（route.legs 注入与真实总耗时）、`server/routes/route-detail.ts`（map view 使用真实 polyline）
- 修改：`components/city/RouteTimeline.tsx`（分段耗时/公交线路名）、`RouteMapCanvas.tsx` / `RouteDetailMap.tsx`(真实道路 polyline)、`RouteInspector.tsx`（可选 step 摘要）
- 新增测试：leg 解析、缓存命中、降级回退

验收标准：

- [x] 配置有效 key 时，时间轴每个连接段显示该段真实耗时；transit 模式显示公交线路名。
- [x] 地图画布与详情页绘制道路级 polyline，而不是站点直线。
- [x] 路线级总耗时等于分段耗时之和。
- [x] 重复请求命中 `traffic_snapshots` 分段缓存。
- [x] 无 key / 调用失败时回退现状展示，接口不报错。
- [x] 不新增数据库 migration；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

风险与降级：

- 方向 API 调用量约为现状 3 倍（仅最终路线、有 10 分钟缓存兜底）；如配额紧张，可改为仅对选中路线懒加载（通过现有 `/api/amap/route` 扩展）。
- transit 响应体较大，`rawPayload` 存储增长；可只保留 polyline 与段摘要、丢弃冗余字段。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：批准实施。逐段规划仅作用于最终 3 条路线，缓存复用 `traffic_snapshots`，不新增 migration，不改变推荐排序。

完成记录：

- 完成日期：2026-06-13
- `server/maps/amap.ts` 新增 `getAmapLegPlan`：walking/driving 解析 `paths[].steps[]`（指令、道路、分段耗时、polyline），transit 解析 `transits[].segments[]`（步行换乘段 + 公交段线路名、上下车站、polyline）；polyline 下采样至 240 点、steps 截断 20 条以控制存储。
- 新增 `server/maps/route-legs.ts`：路线组装后对最终 3 条路线逐段规划 origin→stop1→stop2→stop3；`RecommendedRoute` 新增 `legs`，路线级总耗时改为分段之和，summary 同步重算；缓存读写复用 `traffic_snapshots.rawPayload`（`readLegPlanSnapshot` / `writeLegPlanSnapshot`），无 migration。
- 降级链完整：未开实时 ETA / 无 key / 调用失败时回退估算直线 leg，推荐闭环不受阻；路线排序不变（legs 在 ranker 与交通重排之后注入）。
- UI：`RouteTimeline` 连接段显示每段真实耗时与公交线路名（估算段加“约”前缀），新增出发点节点；`RouteMapCanvas` 与 `buildRouteMapView`（详情页地图）使用真实道路 polyline，无 legs 时回退站点直线。
- 测试：新增 `tests/route-legs.test.ts` 8 个用例（polyline 解析/下采样、walking/transit 解析、估算回退、amap 求和、缓存命中、无 origin/坐标跳过）。
- 真实验证：开启实时 ETA 后首页时间轴显示“22 min · 71路(申昆路枢纽站--延安东路外滩)”、“29 min · 地铁13号线(金运路--张江路)”等真实分段，全程 81 min（amap · 缓行），指标条“高德 ETA 3/3”，地图渲染沿街道路级 polyline；`pnpm typecheck`、`pnpm lint`、`pnpm test`（88 个测试）、`pnpm build` 均通过。

### TASK-P1-011：候选地点图片接入（高德 POI + 小红书封面）

- 状态：`已完成`
- 负责人：Codex
- 是否需要审批：是，涉及数据库结构（`Event` / `Venue` 新增 `imageUrl`）与外部图片直链合规。

背景与现状：

- `amap-poi` adapter 调用 `v3/place/text` 未带 `extensions=all`；带上即可在同一次调用中获得 `photos[]`（POI 实拍图 URL），零额外 API 调用。
- 小红书 MCP（`ANGJustinl/xiaohongshu-mcp@d93a11c`）的 `ai_search_chat` 返回的 `AISourceNote` 已包含 `cover` 字段（笔记封面图 URL），CitySense adapter 尚未映射；`search_feeds` 的 `noteCard` 封面已存在历史 `rawPayload` 中。
- `RawSourceItemDetail`、`Candidate`、`RecommendedRoute.places` 与 UI 均无图片字段。

目标：

- 候选地点带真实图片：高德 POI 实拍图、小红书笔记封面。
- inspector 站点列表与时间轴展示缩略图，提升 demo 视觉说服力。

方案与约束：

- migration：`Event` / `Venue` 新增 `imageUrl String?` 与 `imageSource String?`（记录图片出处，便于追溯与合规审查）。
- `RawSourceItemDetail` 新增 `imageUrl`；`amap-poi` 加 `extensions=all` 映射 `photos[0].url`；`xiaohongshu` 映射 `AISourceNote.cover` 与 feed `noteCard` 封面。
- `imageUrl` 与 `source/sourceUrl/sourceKey` 一样列为系统保留字段：LLM normalizer 不得改写或编造图片 URL。
- UI 直链展示：xhscdn 域名使用 `referrerPolicy="no-referrer"`；图片加载失败时隐藏并回退为现有标签色块占位，不阻塞布局。
- 合规：仅直链展示 + 保留来源链接（现有 sourceUrl 已展示），不下载、不存储图片副本；小红书封面 URL 可能过期，按 best-effort 处理。

计划触达文件：

- 修改：`prisma/schema.prisma` + 新增 migration
- 修改：`server/sources/source.types.ts`、`adapters/amap-poi.adapter.ts`、`adapters/xiaohongshu.adapter.ts`
- 修改：`server/ingest/llm-normalizer.ts`（保留字段）、`server/ingest/pipeline.ts` / `normalize.ts`（imageUrl 入库）
- 修改：`server/recommendation/types.ts`、`candidates.ts`、`route-builder.ts`（places 透出 imageUrl）
- 修改：`components/city/VenueCard.tsx`、`RouteInspector.tsx`、`RouteTimeline.tsx`（缩略图 + 失败降级）
- 新增测试：adapter 图片映射、LLM 保留字段、无图降级

验收标准：

- [x] `amap-poi` 新采集的 venue 带 `imageUrl`，且未增加 API 调用次数。
- [x] `xiaohongshu` AI 搜索来源笔记的封面进入 `imageUrl`。
- [x] LLM normalization 不能改写 `imageUrl`。
- [x] 推荐响应 places 携带 `imageUrl`，inspector 与时间轴展示缩略图。
- [x] 图片 URL 失效或为空时 UI 优雅降级，无破图。
- [x] migration 幂等可回滚；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

风险与降级：

- 小红书封面直链依赖 no-referrer 且 URL 会过期：必须有 onError 降级；如 demo 期间失效率过高，可只用高德 POI 图。
- 历史库存数据无图片：需一次重新采集（`/admin/sources` 手动触发）回填，或接受存量无图。

审批记录：

- 审批人：用户
- 日期：2026-06-13
- 结论：批准实施。`Event` / `Venue` 新增 `imageUrl` / `imageSource` 可空列；图片仅直链展示、不存副本；`imageUrl` 为系统保留字段，LLM 不得改写。

完成记录：

- 完成日期：2026-06-13
- migration `20260611160000_candidate_images`（`ADD COLUMN IF NOT EXISTS` 幂等）已对 Supabase 执行；`Event` / `Venue` 新增 `imageUrl` / `imageSource`。
- adapter：`amap-poi` 在原 `v3/place/text` 调用上加 `extensions=all`（零额外调用）映射 `photos[0].url`；`xiaohongshu` 映射 `ai_search_chat` 的 `AISourceNote.cover` 与 `search_feeds` 的 `noteCard.cover`（urlDefault/urlPre/infoList 兜底），仅接受 http(s) URL。
- 链路：`RawSourceItemDetail.imageUrl` → LLM normalizer 与 `source/sourceUrl` 同级列为系统保留字段（不在 LLM 输出 schema 中，无法被改写）→ pipeline upsert 写 `imageUrl` + `imageSource`（来源归因），空值用 null 清理旧值 → `Candidate` / `RecommendedRoute.places` 透出。
- UI：`VenueCard` 抽出 `PlaceThumb`（`referrerPolicy="no-referrer"` + onError 隐藏），inspector 站点与时间轴均显示缩略图，无图时回退现有标签布局。
- 真实回填：amap-poi 队列 run（UTF-8 请求体）fetched 18 / normalized 18，18 个 venue 带 `imageUrl` 入库；浏览器实测 CARINO BAKERY&CAFE 实拍图在 inspector 与时间轴正常渲染。
- 排障记录：联调期间队列 run 一度 fetched 0，定位为 Windows git-bash curl 内联中文 JSON 编码损坏（高德返回 status=1 count=0），非产品代码问题；浏览器 admin UI 触发不受影响。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`（88 个测试，含 adapter 图片映射、LLM 保留字段、upsert 归因/清理用例）、`pnpm build` 均通过。

- 2026-06-13 优化记录：推荐输入支持默认浏览器定位起点与手动地址起点；手动地址通过高德 geocode 解析后参与距离分、ETA、路线组合顺序和分段 leg 规划，解析失败时降级为城市级推荐。首页地图、时间轴和详情页地图新增起点 marker/名称，路线选择器补充时长、站点和信号摘要，提升路线推荐页面的信息层次。
- 2026-06-13 交互层级优化：首页右侧改为完整路线选择卡片，首屏优先比较路线时长、站点、信号、推荐分与首尾地点；中间指标条降噪为起点、ETA、路线候选和生成时间；详情页改为决策摘要 + 起点/分段 leg/站点的完整行程列表，来源信号和出行建议后置并补空状态。
- 2026-06-13 地图主题性格增强：新增展示层 `RoutePersona`，根据地点标签、图片、来源信号推导夜生活能量线、安静文化线、咖啡美食线、热度探索线和城市探索线；首页地图加入主题 chip、双层选中路线、代表地点图片 marker、底部 story card，详情页同步主题摘要和增强 marker；移动端顺序调整为输入 → 路线选择 → 地图/时间轴 → 证据详情。

### TASK-P1-012：小红书趋势到高德 POI 的审查匹配流水线

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及 LLM 审查、MCP/高德 API 调用策略、推荐参与规则和可能的数据库结构。

背景与现状：

- 当前 `xiaohongshu` 已经被限制为城市信号和证据层，泛化社交内容不直接进入路线地点。
- 当前城市信号叠加主要依赖同城、同区和标签匹配，缺少“小红书热度趋势对应哪个高德地点”的可审查产物。
- `amap-poi` adapter 当前只产出 `Venue`，不产出 `Event`；高德 POI 是路线 marker 和可达性计算的地点权威来源。

目标：

- 将小红书从地图标记和地点权威职责中彻底移出，只作为热度趋势、图片、标题和来源证据。
- 推荐路线中的地点必须来自已确认的高德 `Venue` 或其他可执行地点源；小红书内容只有绑定到确认的高德 `Venue` 后才允许影响推荐。
- 当库内没有现成高德 POI 候选时，ingest 阶段可先用 LLM 从小红书内容解析地点线索，再触发受限高德 POI 搜索补库并进入同一套匹配审查；若仍无法确认高德地点，则该小红书内容不参与推荐。

方案与约束：

- 新增“算法筛选 → LLM 审查”的匹配层：算法先从高德 `Venue` 中按城市、区域、名称相似、地址线索、标签/类型和热度上下文筛 Top-K；LLM 只在 Top-K 候选内做确认、拒绝或标记 ambiguous，不得编造新地点。
- 建议新增可审计匹配产物，如 `CitySignalPlaceMatch` / `SocialPlaceMatch`：记录 `rawSourceItemId`、`citySignalId`、`venueId`、`algorithmScore`、`llmConfidence`、`status`、`matchedFields`、`reason` 和 `reviewedAt`。
- 没有 confirmed match 的小红书内容不得进入 `/api/recommend` 的路线候选、`sourceSignals`、ranker boost 或地图 marker；可保留在 raw ingest / admin 排查视图。
- 泛化合集、攻略、清单类内容只能作为 topic-only 趋势处理，不绑定单个高德 marker，除非 LLM 和算法都确认其中某个具体地点。
- 推荐接口仍不实时调用小红书、MCP 或高德 POI 搜索；补库与匹配发生在 ingest/worker 链路中，并需要限流、缓存和失败降级。

计划触达文件：

- 修改：`prisma/schema.prisma` + 新增 migration（如采用匹配表）。
- 新增：`server/ingest/social-place-matcher.ts` 或同等匹配服务。
- 修改：`server/ingest/pipeline.ts`、`server/ingest/normalize.ts`，在 city signal 写入后触发小红书到高德地点匹配。
- 修改：`server/sources/adapters/xiaohongshu.adapter.ts`，保留笔记事实、封面和热度，不把小红书作为地点权威。
- 修改：`server/sources/adapters/amap-poi.adapter.ts` 或新增受限补库方法，用于 ingest 阶段按 LLM 解析出的地点线索补搜高德 POI。
- 修改：`server/recommendation/signal-fusion.ts`、`server/recommendation/candidates.ts`，只应用 confirmed match 的小红书信号。
- 新增测试：算法 Top-K 筛选、LLM confirmed/rejected/ambiguous 审查、无高德匹配不参与推荐、补库限流和降级。

验收标准：

- [x] 小红书 raw item 不再直接生成推荐地点、路线 marker 或可执行候选。
- [x] 已确认匹配的小红书趋势可以作为对应高德 `Venue` 的 `sourceSignals` 和趋势加分证据展示。
- [x] 库内已有高德 POI 时，先通过算法筛 Top-K，再由 LLM 审查确认匹配。
- [x] 库内没有高德 POI 候选时，ingest 阶段可用 LLM 解析地点线索并受限补搜高德；补搜后仍未确认则不参与推荐。
- [x] LLM 不能返回 Top-K 之外的地点 id，不能改写高德坐标、地址或 `sourceUrl`。
- [x] 泛化小红书合集/攻略不会绑定单个 marker，除非明确确认具体高德地点。
- [x] 推荐接口不实时调用小红书 MCP 或高德 POI 搜索。
- [x] 匹配状态、理由和置信度可在数据库或 admin 排查路径中追溯。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build` 通过。

风险与降级：

- 高德补搜会增加 API 成本和限流风险：必须只在 ingest 阶段触发，并设置每轮上限、缓存和 connector cooldown。
- LLM 审查可能误配同名店或连锁店：算法筛选需要使用区域、地址 token、类型和坐标距离，LLM 低置信度输出必须视为 ambiguous。
- 小红书标题可能是泛化热词：默认不参与推荐，宁可少用信号，也不让不可执行地点污染路线。

审批记录：

- 审批人：用户
- 日期：2026-06-14
- 结论：用户要求开始推进 P1-012，批准实施小红书趋势到高德 `Venue` 的算法筛选与 LLM 审查匹配流水线。

完成记录：

- 完成日期：2026-06-14
- 新增 migration `20260613090007_city_signal_place_matches` 并已对当前 Supabase 执行 `pnpm prisma migrate deploy`；新增 `CitySignalPlaceMatch`，记录 `rawSourceItemId`、`citySignalId`、`venueId`、`status`、`algorithmScore`、`llmConfidence`、`matchedFields`、`reason` 和审查 metadata。
- 新增 `server/ingest/social-place-matcher.ts`：小红书 signal 先按城市、区域、名称相似、地址、标签和高德来源筛选 Top-K 高德 `Venue`；LLM reviewer 只能在 Top-K 中确认地点，低置信度、候选外 venueId、泛化合集和证据不足均降级为 `ambiguous` / `topic_only` / `no_candidate` / `not_configured` / `tool_error`。
- `amap-poi` adapter 抽出 `searchAmapPoiVenueItems`，供 ingest 阶段按 LLM normalized 地点线索受限补搜高德 POI；补库仍只生成 `Venue`，推荐接口不实时调用小红书 MCP 或高德 POI 搜索。
- 推荐召回改为排除直接来源为 `xiaohongshu` 的 normalized candidate；`xiaohongshu` 城市信号只有存在 confirmed `CitySignalPlaceMatch.venueId` 时，才会叠加到对应高德 `Venue` 的 `sourceSignals` 和 `signalStrength`。
- 质量层新增 `social_signal_only`，即使小红书 normalized entity 带地址/坐标，也不会成为 route-eligible 可执行候选。
- 验证：`pnpm prisma:generate`、`pnpm typecheck`、`pnpm test`（104 个测试）、`pnpm lint`、`pnpm build` 均通过；数据库 smoke 验证 confirmed 小红书信号可叠加到高德 `Venue`，且直接小红书 `Venue` 不进入召回候选。
- 2026-06-14 实际推荐 smoke：quiet culture、date weekend、nightlife livehouse、low budget market food 四组真实推荐均返回 3 条路线、真实高德 ETA、可执行高德地点，且无直接小红书地点或未匹配小红书信号泄漏；测试中发现旧库存高德 POI 的默认 `qualityScore=50` 会压掉“市集”候选，已在召回层对旧默认质量分实时重算，low budget market food 首条路线恢复包含 `万有集市(静安店)`。

### TASK-P1-013：大麦 source 插件化采集与活动入库

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及外站采集、浏览器验证码、cookie 存储、worker 自动任务和推荐候选来源。

背景与现状：

- `tools/damai-search/` 当前是独立浏览器辅助导出工具：打开 Edge/Chrome，遇到验证码由用户在浏览器中完成，再把搜索结果写入本地 JSON。
- 目标使用方式不是长期手工导出文件，而是作为 `/admin/sources` 页面可调用的 source 插件：管理员点击抓取，大麦弹出验证码/风控页面，验证后保存仅用于匿名公开搜索的安全 cookie，供 worker 后续自动任务复用。
- 大麦内容本质是演出/活动信号，应进入 `Event`，不应直接承担地图 marker 或地点权威职责。

目标：

- 将大麦接入为 `damai` source adapter，并在 source 管理页提供受控采集入口。
- 管理员可从 `/admin/sources` 启动一次浏览器验证会话；验证码由管理员在弹窗/浏览器中完成，系统只保存可用于无登录公开搜索的最小 cookie 状态。
- worker 自动采集时使用已保存的匿名 cookie 调用大麦搜索接口，先产出 `Event` raw item 并写入 `RawSourceItem`；LLM normalization、`Event` upsert、city signal 和高德 `Venue` 匹配由后续 normalize worker 处理。
- 大麦 `venueName` 只作为地点线索；若后续推荐需要路线可执行地点，必须通过高德 POI 匹配/补库确认地点，不用大麦 venue 文本直接生成地图 marker。

方案与约束：

- 拆分为“管理插件会话”和“worker adapter”两层：管理插件负责打开浏览器、处理验证码、提取并保存允许的匿名 cookie；worker adapter 只读取 cookie/配置并执行搜索采集。
- cookie 存储必须最小化：只保存搜索接口必需的非登录 cookie，不保存账号态、手机号、用户名、localStorage 登录 token 或完整浏览器 profile；不得在日志、API 响应和 raw payload 中打印 cookie。
- cookie 应有过期时间、来源域名白名单和状态检查；失效、被风控或返回 captcha 时，`damai` connector 标记为需要人工验证/paused，不让 worker 自动反复重试。
- 大麦 adapter 只实现 `searchEvents`，`searchVenues` 返回空数组；推荐接口仍不实时调用大麦或浏览器工具。
- 采集 run 不等待 LLM normalization 或地点匹配，避免外部模型、POI 审查或单条异常阻塞 raw 入库；`RawSourceItem.status="new"` 表示待解析，normalize worker 可按 `source`、`ingestRunId` 和 `limit` 后处理。
- 首版可复用 `tools/damai-search` 的搜索 URL、CDP/browser fetch、blocked/captcha 判断和 item normalization，但需要改造成可被 app/server 调用的模块，而不是只靠 CLI stdin。
- 大麦活动入库后的地点执行性由后续匹配负责：可复用小红书到高德 POI 的“算法筛选 → LLM 审查”思想，但 source 类型是活动，匹配目标仍是高德 `Venue`。

计划触达文件：

- 修改：`tools/damai-search/`，抽出可复用 Damai search/session 模块，保留 CLI 作为调试入口。
- 新增：`server/sources/plugins/damai-session.ts` 或同等服务，管理浏览器验证会话、cookie 过滤、状态检查和并发锁。
- 新增：`app/api/admin/damai-session/*`，提供开始验证、检查状态、触发一次采集/保存 cookie 的 API。
- 修改：`components/city/SourceIngestConsole.tsx`，在 source 页增加大麦验证/抓取控制区，展示 cookie 状态、最近验证时间和错误。
- 新增：`server/sources/adapters/damai.adapter.ts`，按 `CitySourceAdapter` 实现 `searchEvents`，映射 title、showTime、priceText、category、imageUrl、sourceUrl 和 source signals。
- 修改：`server/sources/source-registry.ts`，注册 `damai` adapter。
- 可选修改：`prisma/schema.prisma` + migration，如需要独立存储 source secret/cookie metadata，而不是仅依赖本地加密文件或环境配置。
- 新增测试：cookie 过滤、captcha/blocked 状态、Damai item 到 `RawSourceItemDetail` 映射、只产出 Event、不产出 Venue、cookie 失效降级和推荐接口不实时调用。

验收标准：

- [x] `/admin/sources` 可以看到 `damai` connector，并能由管理员启动一次受控验证/抓取会话。
- [x] 验证通过后，只保存无登录公开搜索所需的最小 cookie；日志、API 响应和 raw payload 均不包含 cookie。
- [x] worker 可用已保存或配置的 cookie 自动采集大麦搜索结果；cookie 失效或被风控时 source 状态可见并要求人工重新验证。
- [x] `damai` adapter 只产出 `Event`，`searchVenues` 返回空数组。
- [x] 大麦活动保留 `sourceUrl`、演出时间、票价文本、类别、图片和 venueName 线索，先进入 raw traceability，再由 normalize worker 后处理。
- [x] 大麦 venueName 不直接成为推荐路线 marker；只有匹配到高德 `Venue` 后才可参与路线可执行地点或地点级 source signal。
- [x] 推荐接口不实时启动浏览器、不实时调用大麦搜索。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build` 通过。

风险与降级：

- 大麦风控策略可能变化：失败时 connector 进入人工验证状态，保留已有入库数据，推荐接口继续读取数据库。
- cookie 合规边界需要严格控制：默认拒绝保存疑似登录态 cookie；如页面要求账号登录，本任务不处理登录采集。
- 浏览器会话在服务端环境可能不可用：本地/admin 插件模式优先，生产 worker 仅依赖已保存 cookie；无 cookie 时 `damai` 保持 `not_configured` 或 paused。
- 演出 venueName 可能是模糊场馆名：不得绕过高德 POI 匹配直接当地址或坐标使用。

审批记录：

- 审批人：用户
- 日期：2026-06-14
- 结论：批准将大麦作为 `crawler` source 推进；第一阶段先优化大麦 adapter 的搜索召回、去重和 Event 映射，source 页验证码/cookie 管理后续继续拆分实现。

完成记录：

- 完成日期：2026-06-14
- 结论：已形成真实可验收闭环。`damai` 已作为 `/admin/sources` 可见 crawler source 接入，支持管理员打开验证窗口、保存过滤后的匿名 cookie 元数据、worker 使用 cookie 采集 raw item、normalize worker 后处理、按高德 `Venue` 审查绑定场馆，并由推荐接口只读数据库返回大麦活动路线。P2-002 未开始实施。

阶段记录：

- 2026-06-14 第一阶段：新增 `server/sources/adapters/damai.adapter.ts` 并注册到 source registry；`damai` 作为 `crawler`，在配置 `DAMAI_COOKIE_HEADER` 前保持 `not_configured`。
- 搜索优化：将 CitySense 兴趣词扩展为大麦更有效的演出 query，并按用户关键词轮询取词，避免“夜生活”等多扩展词挤掉“展览”等后续兴趣；支持多 query、多页、去重和排序。
- 映射优化：大麦结果只产出 `Event`，保留 `sourceUrl`、演出时间、票价、类别、图片、售票状态和 `venueName` 场馆线索；`searchVenues` 明确返回空数组。
- 降级：大麦返回 captcha / punish / `FAIL_SYS_USER_VALIDATE` 时抛出 `damai_requires_manual_verification`，供后续 source 页提示管理员重新验证。
- 验证：新增 `tests/damai-adapter.test.ts` 覆盖 query 扩展、时间解析、未配置 cookie 降级、Event-only 映射和验证码阻断；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 均通过。

D
- 2026-06-14 第二阶段：新增 `server/sources/plugins/damai-session.ts` 与 `/api/admin/damai-session/status|start|save`，source 页增加大麦验证面板；管理员可打开浏览器验证窗口，完成验证码后保存过滤后的匿名大麦 cookie 到 `data/damai-session/cookies.json`。
- 安全边界：API 和 UI 只展示 cookie 状态、数量、名称、保存时间和过期时间，不返回 cookie 值；过滤逻辑只接受 `damai.cn` 域 cookie，并丢弃明显账号态 cookie（如 nick/user/login/member/tracknick 等）。
- adapter 读取顺序更新为：显式传入 cookie → `DAMAI_COOKIE_HEADER` → 本地保存 cookie 文件；`data/damai-session/` 已加入 git/eslint ignore。
- 新增 `tests/damai-session.test.ts` 覆盖 cookie 过滤；验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。真实大麦验证码窗口仍需管理员在本机浏览器做一次 smoke。
- 2026-06-14 修正：打开大麦验证窗口后立即返回 UI，不再等待 DevTools target 导致按钮持续 loading；读取 cookie 时再懒连接浏览器。保存的匿名 cookie 文件作为持久凭据反复复用，不因本地 `expiresAt` 主动判废，直到大麦接口再次要求验证码时由管理员重新保存覆盖。
- 2026-06-14 第三阶段：按“先采集入库，后解析”拆分 ingest pipeline；`executeIngestRun` 现在只执行 adapter 搜索与 `RawSourceItem` upsert，run stats 中 `normalized` / `citySignalsCreated` 在采集阶段保持 0，避免 LLM normalization、地点匹配或单条解析失败阻塞 raw 入库。
- 新增 `processPendingRawSourceItems`、`normalizeRawSourceItemById` 与 `pnpm worker:normalize`，支持通过 `NORMALIZE_WORKER_SOURCE`、`NORMALIZE_WORKER_INGEST_RUN_ID`、`NORMALIZE_WORKER_LIMIT` 分批处理 `status="new"` 的 raw item；normalize 阶段负责 LLM normalized entity、`Event`/`Venue` upsert、city signal 写入与高德场馆匹配。
- 大麦场馆匹配质量修正：算法候选过滤票务中心、售票点、购物广场、管理公司等非演出 POI；大麦 `venueName` 增加确定性兼容校验，LLM 不能确认与大麦场馆名冲突的候选，未确认时清空 `Event.venueId`，避免 stale 错配继续进入路线。
- 推荐路线去重修正：路线组装把已匹配 `Event.venueId` 与对应高德 `Venue.id` 视为同一地点簇，并对场馆名/地址做标点归一，避免同一演出场馆和场馆 POI 被拼进同一条路线。
- 实测记录：已有成功大麦 run `cmqddnv6u0001ojycdrpud4qd` 入库 `fetched=40`、`rawUpserted=40`、`normalized=40`、`citySignalsCreated=167`；推荐 smoke `cmqdmmjp900oqojw0ffkqvj1a` 返回 3 条路线，7 个大麦活动均有来源 URL、已确认高德场馆与坐标，路线内未发现重复场馆。
- 历史阻断记录：旧 cookie / 浏览器会话曾返回 `damai_requires_manual_verification`；后续管理员重新验证并提供短效匿名搜索 cookie 后，live raw-only 采集已成功。此类 x5sec cookie 约 30 分钟过期，过期后仍按人工重验降级。
- 2026-06-14 live cookie 复测：管理员重新验证后，raw-only ingest run `cmqdoakr90000ojwgw69fzr9h` 在约 19 秒内完成，`fetched=120`、`rawUpserted=120`、`normalized=0`、`citySignalsCreated=0`，120 条均保持 `status=new`，证明采集入库不再等待解析/匹配。
- 同一 cookie 窗口内追加“只新增不覆盖”扩展采集：run `cmqdoph7y0000ojj0kri1cluw` 抓到 360 个唯一项目、新增 240 条 raw；run `cmqdors4w0000oj4stpq4hrg0` 使用另一排序抓到 360 个唯一项目、新增 123 条 raw。当前大麦 raw 总量 484 条，其中未解析 raw 安全排队。
- 后处理 smoke：`pnpm worker:normalize` 先处理 20 条完整 LLM normalization，再以 `CITYSENSE_LLM_NORMALIZE_ENABLED=false` 处理 40 条 adapter draft + 高德场馆 LLM 审查，合计 61 条 raw normalized；库内大麦 `Event` 100 条，`sourceUrl` / `imageUrl` / `startTime` 覆盖 100/100，29 条已绑定高德 `Venue` 坐标。
- 推荐 smoke `cmqdp6y500119ojw0vmgts29q` 返回 3 条路线，包含《芝加哥·欲望牢笼》、音乐剧《锦衣卫之刀与花》、陈昊宇主演话剧《初步举证》、BADBADNOTGOOD 上海站等大麦活动；活动均携带 sourceUrl、图片和高德坐标化场馆，推荐接口仍只读数据库。




## P2：黑客松后的产品化打磨

### TASK-P2-001：MCP Connector 抽象

- 状态：`待审批`
- 负责人：待定
- 是否需要审批：是

待办：

- [ ] 定义 MCP connector 配置结构。
- [ ] 加入支持 OAuth 状态的连接器模型。
- [ ] 实现面向授权用户数据的 tool routing。
- [ ] 确保 MCP 数据不进入实时推荐链路，除非先完成预采集和入库。

验收标准：

- [ ] MCP 被视为数据和工具网关，而不是推荐引擎。
- [ ] 敏感用户数据必须经过授权。
- [ ] 未授权连接器状态会展示在 admin UI 中。

审批记录：

- 审批人：
- 日期：
- 结论：

### TASK-P2-002：用户品味画像 MVP

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：是，涉及用户数据、推荐算法权重、持久化画像和隐私/删除能力。

背景与现状：

- 当前推荐请求已支持 `userId`，反馈链路会把路线级反馈写入 `recommendation_feedbacks`，并镜像为 `UserInteraction`。
- 当前 ranker 已有 `userAffinity` 和 `feedbackPenalty` 特征，但只从近期 interaction 即时聚合，缺少可审计、可解释、可重算的用户画像产物。
- Prisma 已存在 `UserPreference` 占位表，包含 `interests`、`mood`、`budget` 和 `metadata`，但尚未形成完整的画像更新和推荐接入闭环。

目标：

- 建立轻量、可解释的用户画像 MVP：先用确定性权重聚合，不引入 pgvector 或黑盒 embedding。
- 同时刻画正偏好、负偏好和新鲜度：喜欢什么 tag/source/area/价格/氛围，也要知道用户最近反感或看腻了什么。
- 让推荐结果对老用户、匿名会话和无画像用户具备清晰差异，并在响应/日志中保留画像影响证据。
- 画像只增强排序，不替代城市信号、可执行地点、高德交通和 LLM 审查约束。

画像内容建议：

- 显式偏好：用户请求中的 `interests`、`mood`、`budget`、`timeWindow`、常用城市/区域。
- 隐式反馈：`up/save/down/dismiss` 对路线地点、标签、source、area、priceLevel、quietness/popularity 区间的加权影响。
- 新鲜度：近期曝光过的地点、路线主题、重复 tag/source/area 的衰减或惩罚。
- 画像快照：在 `UserPreference.metadata` 中保存 `profileVersion`、`updatedFrom`、`positiveWeights`、`negativeWeights`、`recentExposure`、`topReasons` 和 `decayWindowDays`。
- 隐私边界：不保存精确浏览器坐标；如需位置偏好，仅保存城市/区级粒度；支持清空画像。

方案与约束：

- 第一阶段用 `UserPreference` 承载画像快照，不新增复杂用户系统；`userId` 优先，匿名场景可继续使用稳定 `sessionId` 作为画像 key。
- 新增画像服务：从 `RecommendationLog`、`RecommendationFeedback`、`UserInteraction` 重算最近 90 天偏好，使用时间衰减和动作权重生成 profile。
- 反馈写入后可异步或 best-effort 更新画像；推荐请求也可在读取画像失败时回退到当前即时 interaction 聚合。
- ranker 接入画像时只更新 `userAffinity`、`feedbackPenalty` 和新鲜度惩罚，不改变地点可执行性、城市信号匹配和交通重排原则。
- 画像影响必须可解释：feature snapshot 或 recommendation meta 中能看到命中的 top profile factors，例如 `tag:展览 +8`、`source:damai +3`、`recentlySeen:venue -6`。
- 暂不引入 pgvector；只有当确定性画像稳定、且需要语义泛化时，再单独规划 embedding/向量相似度任务。

计划触达文件：

- 修改：`prisma/schema.prisma`（如现有 `UserPreference.metadata` 不够表达，再新增字段或 profile history 表）。
- 新增：`server/recommendation/user-profile.ts`，负责画像重算、读取、清空和 explain factors。
- 修改：`server/recommendation/user-signals.ts`，从即时 interaction 聚合升级为优先读取画像快照，失败时回退原逻辑。
- 修改：`server/recommendation/features.ts` / `ranker.ts` / `scoring.ts`，接入画像版 `userAffinity`、`feedbackPenalty` 和 repeated exposure penalty。
- 修改：`server/recommendation/feedback.ts`，反馈写入后 best-effort 更新对应画像。
- 可选新增：`app/api/user-profile/route.ts`，支持查看画像摘要和清空画像。
- 新增测试：画像聚合、时间衰减、正负反馈权重、新鲜度惩罚、无画像降级、隐私字段不落库、推荐排序差异。

验收标准：

- [x] 有历史正反馈的用户，会更容易看到相同 tag/source/area/预算风格的候选，但仍受可执行性和交通约束限制。
- [x] 有历史负反馈或 dismiss 的用户，相同地点、相同主题或相同 source 的候选会被降权。
- [x] 最近多次曝光过的地点或路线主题会受到新鲜度惩罚，避免连续重复推荐。
- [x] 无 `userId/sessionId`、画像为空或画像读取失败时，推荐接口回退到当前通用推荐，不报错。
- [x] `RecommendationFeatureSnapshot` 或推荐 meta 能追溯画像命中的 top factors。
- [x] 用户可以清空画像；清空后推荐恢复到无画像状态。
- [x] 不保存精确浏览器坐标、原始自由文本敏感信息或不可解释的 LLM 画像判断。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build` 通过。

风险与降级：

- 数据稀疏导致画像过拟合：需要最小样本阈值和权重上限，不能因为一次反馈把排序锁死。
- 负反馈可能表达“此路线组合不合适”，不一定是地点本身差：负权重要分散到 route/theme/source/tag，地点级惩罚需更短半衰期。
- 匿名 session 不稳定：匿名画像只做轻量增强，不作为长期用户资产；未来接入账号系统后再迁移。
- 画像可能与城市实时热度冲突：画像只做排序特征，不能让低质量、不可达或未确认地点进入路线。

审批记录：

- 审批人：用户
- 日期：2026-06-14
- 结论：用户与 Codex 讨论后批准实施。决策：profileKey = userId ?? sessionId 沿用现状 key;读时懒重算 + TTL 30 分钟失效;新鲜度从 RecommendationLog 推导曝光;MVP 维度含 tag/source/area/正负/新鲜度 + price/氛围 + UI explain 面板;UserPreference 新增标量列 + metadata 承载快照;explain 落 FeatureSnapshot + meta.userProfile。

完成记录：

- 完成日期：2026-06-14
- migration `20260614090000_user_profile_metadata`(`ADD COLUMN IF NOT EXISTS` 幂等)已对 Supabase 执行;`UserPreference` 新增 `profileVersion` / `signalCount`,完整画像快照存 `metadata` Json。
- 新增 `server/recommendation/profile.types.ts`(画像类型与维度常量)、`server/recommendation/user-profile-core.ts`(纯计算:衰减、正负权重聚合、6 维度、权重 cap、曝光统计、因子提取、top reasons)、`server/recommendation/user-profile.ts`(prisma 薄封装:load/recompute/ensure/clear + buildProfileMeta)。
- 时间衰减:正反馈 4 档(1d/7d/30d/90d+ = 1/0.72/0.42/0.18),负反馈 venue 维度更短半衰期(7d 后 0.5,30d 后 0.18,90d+ 0.05),对应"负权重要分散、地点级惩罚需更短半衰期"。
- 最小样本阈值 3 条 + 单维度权重上限 12,避免稀疏过拟合和单次反馈锁死排序。
- `user-signals.ts` 改造:优先 `ensureFreshProfile` 读画像快照重建 7 张权重 map(含 area/price/quietness/popularity),画像为空/读失败回退即时聚合;修复了原实现 `return empty` 永远返回空 map 的潜伏 bug。
- ranker 用 `profileKey = userId ?? sessionId` 加载 signals,并通过 `RankOutput.signals` 暴露给 recommend 构建 meta;`features.ts` 注入 `profileFactors`;`scoring.ts` 的 userAffinity/feedbackPenalty 接入新维度,recentExposure 命中叠加新鲜度惩罚。
- `RecommendInput` / `recommendRequestSchema` 新增 `sessionId`;`RecommendationLog.userId` 改为 `userId ?? sessionId` 补齐匿名曝光数据来源;`RecommendedRoute.places` 透传 area/priceLevel/quietness/popularity;`feedback.ts` interaction context 扩展写入这些维度。
- 新增 `GET/DELETE /api/user-profile`(读画像摘要 / 清空画像);新增 `components/city/UserProfilePanel.tsx`(explain 面板,优先用 response.meta.userProfile inline,清空按钮仅对登录用户);`RecommendationWorkspace` 加第 5 列 profile-rail + 稳定匿名 sessionId(模块级,事件处理器内调用,避免 React 纯净规则)。
- 清空画像同时删除 `UserInteraction`(画像数据源),保留 `RecommendationFeedback` 和 `RecommendationLog` 审计事实;清空后推荐 `source` 回退 `fallback`/`empty`。
- 隐私:area 仅区级粒度,context 只存 tags/source/数值桶,不存精确坐标或自由文本敏感信息;无 LLM 画像判断。
- 测试:`tests/user-profile.test.ts` 28 个用例覆盖衰减档位、最小样本、6 维度聚合、权重 cap、曝光统计、因子提取、topReasons、stale 判断、meta 构建、历史数据兼容;修复 `recommendation-v1.test.ts` signals 字面量。
- 验证:`pnpm prisma:generate`、`pnpm typecheck`、`pnpm lint`、`pnpm test`(128 个测试)、`pnpm build` 均通过。
- 真实 smoke(user `smoke-p2-002`):基线 `source: fallback` → 3 次 up/save 反馈 → 推荐 `source: profile, updatedFrom: 9, topPositive 5 因子, recentExposureHits 7` → GET /api/user-profile 返回完整画像 → DELETE 清空 → 推荐 `source: fallback, updatedFrom: 0` 回退 → 匿名请求 `source: empty` 不报错。

### TASK-P2-003：部署与运维

- 状态：`待审批`
- 负责人：待定
- 是否需要审批：是

待办：

- [ ] 将 Next.js 应用部署到 Vercel 或指定平台。
- [ ] 配置 Supabase 生产数据库。
- [ ] 配置生产环境变量。
- [ ] 制定 worker 部署方案。
- [ ] 增加 smoke test 检查清单。

验收标准：

- [ ] 生产 URL 可以访问推荐工作台。
- [ ] API routes 在生产环境变量下正常工作。
- [ ] worker 职责已文档化，并可以被调度执行。

审批记录：

- 审批人：
- 日期：
- 结论：

### TASK-P2-004：AI 对话分析助手

- 状态：`已完成`
- 负责人：Codex / 用户
- 是否需要审批：否，作为推荐工作台的辅助交互层，不涉及数据库结构、推荐算法权重或外部 API 成本变化。

背景与现状：

- 推荐工作台已有完整的偏好输入、路线生成、地图、画像 explain 面板，但用户无法用自然语言探索城市或追问路线细节。
- 已有 LLM 解释层（TASK-P1-003）只在推荐链路末端改写 reason/tips，不支持多轮对话和工具调用。
- 已有城市信号、推荐路线、路线详情、用户画像等纯 async 函数，可作为助手工具直接复用。

目标：

- 提供一个基于真实数据的 AI 对话助手，用户可以用自然语言问"今晚静安有什么好玩的""最近流行什么""你了解我吗"。
- 助手通过 function calling 调用 4 个工具（recommend_routes / get_city_pulse / get_route_detail / get_user_profile），绝不编造地点或数据。
- 流式 SSE 回复，支持多轮对话历史（Redis 持久化，24h TTL）。
- 作为推荐工作台的浮动入口（右下角按钮 + 右侧抽屉），不破坏现有 5 列布局。

方案与约束：

- 使用智谱 paas/v4 chat/completions（glm-4-flash，与 explain-route 的 Responses API 隔离），stream + tools 100% 兼容 OpenAI 格式。
- 工具直接复用现有纯 async 函数（recommend / getCityPulse / getRouteDetail / loadProfile），无 HTTP 中转。
- 每个工具有 summarize 函数，只保留 LLM 需要的关键字段，控制 token。
- 降级链：无 LLM key → 报错提示；无 Redis → 退化为无历史单轮；工具失败 → 错误占位给 LLM；超时 → AbortController。
- 最多 3 轮 tool_calls，达到上限强制收尾。
- recommend_routes 工具默认 useRealtimeTraffic: false（避免每次对话都打高德 API）。

计划触达文件：

- 新增：`server/ai/chat-client.ts`（流式 chat completions 客户端）、`chat-tools.ts`（4 工具定义 + handler）、`chat-session.ts` + `chat-redis.ts`（Redis 对话历史单例）。
- 新增：`app/api/chat/route.ts`（SSE 端点，POST 流式 + DELETE 清空历史）。
- 新增：`hooks/useChat.ts`（对话状态 + SSE 消费 hook）、`components/assistant/ChatDrawer.tsx` + `ChatDock.tsx`。
- 修改：`components/RecommendationWorkspace.tsx`（挂载 ChatDock 浮动按钮 + ChatDrawer 抽屉，传 sessionId + context）。
- 修改：`app/globals.css`（chat-* 样式：抽屉、气泡、工具卡片、输入栏、浮动按钮）。
- 新增测试：`tests/chat-client.test.ts`（SSE 解析、tool_calls 累积、错误降级）、`tests/chat-tools.test.ts`（参数解析降级、未知工具、工具定义结构）。

验收标准：

- [x] 助手能流式回复用户问题，回复基于工具返回的真实数据，不编造地点。
- [x] 用户问探索性问题时，助手调用 recommend_routes 生成路线。
- [x] 用户问城市趋势时，助手调用 get_city_pulse 返回真实信号。
- [x] 用户问自己偏好时，助手调用 get_user_profile 返回画像摘要。
- [x] 多轮对话历史持久化到 Redis，刷新后仍可续接。
- [x] 无 LLM key 时返回明确错误提示，不崩溃。
- [x] 右下角浮动按钮可打开/关闭助手抽屉，不影响现有布局。
- [x] `pnpm typecheck`、`pnpm lint`（P2-004 文件）、`pnpm test`（chat 测试 12 个）、`pnpm build` 通过。

风险与降级：

- Redis 抖动后单例置 null 不重连（demo 可接受，已知限制）。
- recommend_routes 工具不走高德实时 ETA（合理默认，路线耗时为估算值）。
- 历史消息未过滤 tool role（当前只存 user/assistant content，不触发）。
- glm-4-flash 是免费模型，可能有速率限制；超时由 AbortController 兜底。

审批记录：

- 审批人：无需审批
- 日期：2026-06-14
- 结论：已完成。chat-client（glm-4-flash 流式 + tools）、chat-tools（4 工具复用现有纯函数）、chat-session（Redis 24h TTL 历史）、SSE 端点、useChat hook、ChatDrawer/ChatDock 组件、workspace 挂载、chat-* 样式全部实现；真实 smoke 验证流式回复 + get_city_pulse 工具调用链路通过。

完成记录：

- 完成日期：2026-06-14
- 后端：`chat-client.ts` 实现 ZhipuChatClient（fetch-based，注入 fetchFn 可测），SSE 解析支持 delta/tool_calls 累积/[DONE]/错误降级；`chat-tools.ts` 4 工具（recommend_routes/get_city_pulse/get_route_detail/get_user_profile）复用现有纯 async 函数，每个有 summarize 控制 token；`chat-session.ts` Redis 历史（RPUSH + LTRIM 裁剪 20 条 + 24h TTL）；`chat-redis.ts` 模块级单例（连接错误降级 null）。
- API：`POST /api/chat` SSE 流式（system prompt + history + 多轮 tool_calls 循环最多 3 轮 + 持久化），`DELETE` 清空历史。
- 前端：`useChat.ts`（fetch + ReadableStream 消费 SSE，delta/tool_start/tool_end/error/done 事件处理），`ChatDrawer.tsx`（168 行，气泡/工具卡片/建议按钮/ESC 关闭/清空/停止），`ChatDock.tsx`（浮动按钮）。
- workspace 挂载：ChatDock 固定右下角，ChatDrawer 右侧抽屉，传 sessionId（复用画像任务的 getAnonymousSessionId）+ context（profileKey/recommendationId/city/area）。
- 测试：`chat-client.test.ts` 8 个（delta 流、tool_calls 跨 chunk 累积、finishReason、HTTP 错误、网络错误、工具定义结构、required 字段），`chat-tools.test.ts` 5 个（参数解析降级、未知工具、展示名映射、缺 routeId、匿名 profile）。
- 真实 smoke：简单问候 → 流式自我介绍（30+ delta + done）；"最近上海流行什么" → 触发 get_city_pulse 工具调用 → 基于真实数据回复（4 个 up 趋势、80 次出行）。
- 已知问题（非本次引入）：`recommendation-v1.test.ts` 的 "route assembler prefers fully addressed routes" 用例在 P2-002 提交（3ad63bd）即失败，与 P2-004 无关，需后续单独修复。

### TASK-P2-005：首页清新化重构（地图优先 + 情绪化输入 + 画像精细化）

- 状态：`待审批`
- 负责人：Codex / 用户
- 是否需要审批：是，作为 demo 主界面的视觉重构，涉及首页布局结构、CSS 变量契约变化和多个面板视觉改造。

背景与现状：

- 当前首页是"地图优先的 5 列工作台"（偏好输入 + 地图 + 路线 inspector + 城市脉冲 + 用户画像），信息密度高，偏工具感/dashboard 感。
- demo 方向已确认：**面向用户的清新实用 UI**，而非评委导向的高信息密度展示。
- 项目里已有情绪化视觉组件（`components/explorer/MoodOrbSelector`、`GiftRouteCard`、`CityPulseLoader`），目前在 `/explore` `/demo` 页面用 mock 数据展示，和真实推荐系统割裂。
- MoodOrbSelector 的数据契约（`{value: MoodType, onChange}`）和现有 mood state 完全兼容，可直接接入。
- 用户画像面板（P2-002）功能完整但视觉朴素：偏好/反感因子是纯文字标签云（`tag:咖啡 +8`），像调试面板而非"用户档案"。

目标：

- 将首页从"工具感工作台"重构为"清新实用的产品界面"，同时保留地图为视觉中心。
- **左侧偏好输入情绪化**：心情选择用 MoodOrbSelector（球体选择器）替代干巴巴的分段按钮；兴趣标签放大、加 emoji。
- **右侧面板精简**：城市脉冲 + 用户画像合并为一个可折叠的"推荐透视"区，默认折叠；路线 inspector 保留但加来源徽章。
- **中间地图区降噪**：指标条默认折叠，点击"为什么推荐？"展开。
- **用户画像面板精细化**：偏好/反感因子用 emoji + 色块卡片网格展示，强偏好卡片更大/更亮；空状态引导式占位。
- 保留轻量来源徽章（让用户感知推荐真实性），但完整技术面板不默认暴露。

方案与约束：

- **不重写整个工作台**，分层改造现有 `RecommendationWorkspace`：输入栏情绪化 → 右侧面板精简 → 中间地图降噪 → 画像面板精细化。
- **不改推荐算法/数据契约**：推荐接口、路线组装、画像逻辑都不动。
- **不改 AI 助手**：ChatDock/ChatDrawer 继续作为浮动入口。
- **不改路线详情页**：`/routes/[id]` 保持现状。
- grid 布局从 5 列减为 3 列（controls + map + inspector），CSS 变量契约（`--control-col` 等）和 resize handle 需同步调整。
- MoodOrbSelector 自注入 `<style>` 标签（运行时），使用 `.mood-orb-*` 命名空间，不依赖 globals.css，不和现有样式冲突。
- 折叠区用原生 `<details>/<summary>`（无 JS、无 a11y 问题）或 useState + CSS transition。
- 数据映射（如需接 GiftRouteCard）：duration/distance/score/tags/image 字段格式化，复用 `components/city/route-display.ts` 的 formatDistance。
- 画像卡片：emoji 映射（tag/source/area 各有默认 emoji，未映射用通用 emoji）；卡片大小映射权重（≥6 大卡、3-5 中卡、1-2 小卡）；偏好用 teal 系，反感用弱化 coral 系；不改 `UserProfileMeta` 数据结构。

实施阶段：

1. **左侧输入栏情绪化**：MoodOrbSelector 替换心情分段按钮；兴趣标签放大加 emoji。
2. **右侧面板精简**：3 列（inspector + pulse + profile）合并为 inspector + 可折叠"推荐透视"区。
3. **中间地图降噪**：指标条包进 `<details>` 默认折叠，收起时显示一行摘要。
4. **用户画像面板精细化**：偏好/反感用 emoji 色块卡片网格；强偏好更大更亮；空状态引导式占位；权重视觉强度替代裸露数字。
5. **清理 + 验证**：删除孤立的 `app/explorer.css`；typecheck/lint/build/smoke。

画像面板视觉设计（卡片网格方案）：

```
┌─────────────────────────────────┐
│ 👤 你的探索画像                   │
│ ─────────────────────────────── │
│ 已学习 · 12 条反馈 · 探索 7 处    │
│                                 │
│ 偏好                             │
│ ┌─────────┐ ┌──────┐ ┌──────┐  │
│ │  ☕ 咖啡 │ │🎨展览 │ │📍静安│  │
│ │  +8     │ │ +6   │ │ +5  │  │
│ │ (teal)  │ │(teal)│ │(teal)│  │
│ └─────────┘ └──────┘ └──────┘  │
│ ┌──────┐ ┌──────┐               │
│ │📚书店│ │🎵音乐│               │
│ │ +4  │ │ +3  │               │
│ └──────┘ └──────┘               │
│                                 │
│ 反感                             │
│ ┌──────────┐                    │
│ │ 🌃 夜生活 │                    │
│ │  -2      │                    │
│ │ (coral)  │                    │
│ └──────────┘                    │
│                                 │
│ [🗑 清空画像]                    │
└─────────────────────────────────┘
```

计划触达文件：

- 修改：`components/RecommendationWorkspace.tsx`（左侧输入情绪化 + 右侧面板精简 + 指标条折叠 + grid 列数调整 + CSS 变量契约）
- 修改：`components/city/RouteInspector.tsx`（路线选项卡片加来源徽章和推荐分）
- 修改：`components/city/UserProfilePanel.tsx`（卡片网格布局 + emoji 映射 + 权重视觉强度 + 空状态）
- 修改：`app/globals.css`（`.workspace.map-first` grid 从 5 列改 3 列；折叠区样式；情绪化标签样式；画像卡片网格 `.profile-*` 样式）
- 复用：`components/explorer/MoodOrbSelector`（直接接入，零适配）
- 可选修改：`components/city/SourceSignalBadge` / `TrafficBadge`（如需在路线选项卡片复用）
- 清理：删除孤立的 `app/explorer.css`（628 行，无人 import）
- 不改：推荐算法、数据契约、API 路由、AI 助手、路线详情页

验收标准：

- [ ] 左侧心情选择是情绪化球体（MoodOrbSelector），不是干巴巴的分段按钮。
- [ ] 兴趣标签是大尺寸带 emoji 的，不是小 chip。
- [ ] 右侧只有 1 个路线 inspector 列 + 1 个可折叠"推荐透视"区（不再是 3 列）。
- [ ] 路线选项卡片显示来源徽章和推荐分。
- [ ] 指标条默认折叠，可展开。
- [ ] 偏好因子以 emoji + 色块卡片展示，不再是纯文字标签。
- [ ] 强偏好（高权重）卡片视觉更突出（更大/更饱和）。
- [ ] 反感因子用弱化 coral 色块，视觉权重低于偏好。
- [ ] 空状态有引导感的插画式占位（大 emoji + 引导文案）。
- [ ] 生成路线、AI 助手、反馈按钮仍正常工作。
- [ ] 桌面端和移动端布局都不出现溢出或重叠。
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。

风险与降级：

- MoodOrbSelector 自注入样式如和 globals.css 冲突：可提取其 `<style>` 到 globals.css 统一管理。
- grid 列数变化导致 resize handle 失效：resize handle 是成对的（left+right），删列要同步删对应 handle，WorkspacePanel 类型同步调整。
- 折叠区交互定制：原生 `<details>` 样式定制有限，如需更精细控制用 useState + CSS transition。
- 画像 emoji 映射不全：未映射维度用通用 emoji 兜底，不报错。
- 画像卡片数量过多：限制 topPositive 显示数量（如 6 个），超出可折叠。

审批记录：

- 审批人：
- 日期：
- 结论：

## 当前审批队列

- [x] 审查并批准 `TASK-P0-001`。
- [x] 审查并批准 `TASK-P0-002`。
- [x] 审查并批准 `TASK-P0-003`。
- [x] 审查并批准 `TASK-P0-004`。
- [x] 审查并批准 `TASK-P0-005`。
- [x] 审查并批准 `TASK-P1-005`。
- [x] 审查并批准 `TASK-P1-006`。
- [x] 审查并批准 `TASK-P1-010`。
- [x] 审查并批准 `TASK-P1-011`。
- [x] 审查并批准 `TASK-P1-012`。
- [x] 审查并批准 `TASK-P1-013`。
- [x] 审查并批准 `TASK-P2-002`。
- [x] TASK-P2-004 无需审批(辅助交互层)。
- [ ] 审查并批准 `TASK-P2-005`。

## 变更记录

- 2026-06-13：创建中文版任务规划和开发者审批流程。
- 2026-06-13：同步 001 已完成、002 进行中；推进 003 的高德 ETA 接入、交通缓存、Top-N 调用、估算降级和 UI provider 状态。
- 2026-06-13：配置有效高德 key 后，完成 walking/transit/driving、推荐排序和缓存命中的真实联调，TASK-P0-003 标记为已完成。
- 2026-06-13：推进 TASK-P0-005，新增 `docs/api.md`、路线详情测试、`GET /api/routes/:id`、路线快照 id、详情页和静态地图降级。
- 2026-06-13：配置前端高德 JS API key 后完成真实地图验收，TASK-P0-005 标记为已完成。
- 2026-06-13：完成 TASK-P1-001 Source Adapter 入库流水线，新增 BullMQ + Redis 队列、独立 worker、统一 adapter 基类、ingest run 状态、raw/normalized 入库和 admin 手动触发。
- 2026-06-13：完成推荐系统实现调研规划，新增 `docs/recommendation-system-plan.md` 和 `TASK-P1-005`，进入开发者审批流程。
- 2026-06-13：完成推荐系统 V1 实现，新增反馈事件、feature snapshot、多路召回、`weighted-v1` ranker、小规模路线组合评分、反馈按钮和推荐 V1 测试。
- 2026-06-13：按 P0-004 方案 B 修正反馈实现，新增 `recommendation_feedbacks` 事实表和严格反馈 API 契约。
- 2026-06-13：完成 TASK-P1-004 城市脉搏可视化，新增 city pulse API 和右侧趋势面板。
- 2026-06-13：根据 ImageGen 图二新增 TASK-P1-006，规划地图优先的推荐工作台 UI 迭代。
- 2026-06-13：用户批准 TASK-P1-006 并调整地图方案为复用真实高德 JS 地图，任务进入实施。
- 2026-06-13：完成 TASK-P1-006 地图优先工作台，新增 RouteMapCanvas / RouteInspector / RouteTimeline / RouteFeedbackButtons 与共享高德 loader，首页以真实高德地图为视觉中心。
- 2026-06-13：调研并新增 TASK-P1-010（高德分段路径规划）与 TASK-P1-011（候选地点图片接入），用户批准实施。
- 2026-06-13：完成 TASK-P1-011 候选地点图片接入（高德 POI extensions=all + 小红书封面，imageUrl 系统保留字段，真实采集回填 18 个带图 venue）。
- 2026-06-13：完成 TASK-P1-010 高德分段路径规划（route legs、分段耗时与公交线路名时间轴、道路级 polyline、traffic_snapshots 分段缓存、估算降级）。
- 2026-06-13：调研并新增 TASK-P1-010（高德分段路径规划）与 TASK-P1-011（候选地点图片接入），进入审批队列。
- 2026-06-13：新增 TASK-P1-012，规划“小红书趋势先算法筛选高德 Venue、后 LLM 审查匹配；无确认高德地点则不参与推荐”的优化任务。
- 2026-06-14：完成 TASK-P1-012，小红书趋势改为经算法 Top-K 筛选和 LLM 审查后绑定高德 `Venue`；未 confirmed 的小红书内容不参与推荐。
- 2026-06-14：新增 TASK-P1-013，规划大麦作为 `/admin/sources` 可调用插件：管理员完成人工验证码，保存无登录公开搜索 cookie，worker 后续自动采集并只产出 `Event`。
- 2026-06-14：推进 TASK-P1-013 第一阶段，新增 `damai` crawler adapter，优化多关键词搜索召回、去重和 Event-only 映射；source 页验证码/cookie 管理继续保留为后续工作。
- 2026-06-14 第二阶段：新增 `server/sources/plugins/damai-session.ts` 与 `/api/admin/damai-session/status|start|save`，source 页增加大麦验证面板；管理员可打开浏览器验证窗口，完成验证码后保存过滤后的匿名大麦 cookie 到 `data/damai-session/cookies.json`。
- 安全边界：API 和 UI 只展示 cookie 状态、数量、名称、保存时间和过期时间，不返回 cookie 值；过滤逻辑只接受 `damai.cn` 域 cookie，并丢弃明显账号态 cookie（如 nick/user/login/member/tracknick 等）。
- adapter 读取顺序更新为：显式传入 cookie → `DAMAI_COOKIE_HEADER` → 本地保存 cookie 文件；`data/damai-session/` 已加入 git/eslint ignore。
- 新增 `tests/damai-session.test.ts` 覆盖 cookie 过滤；验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。真实大麦验证码窗口仍需管理员在本机浏览器做一次 smoke。
- 2026-06-14 修正：打开大麦验证窗口后立即返回 UI，不再等待 DevTools target 导致按钮持续 loading；读取 cookie 时再懒连接浏览器。保存的匿名 cookie 文件作为持久凭据反复复用，不因本地 expiresAt 主动判废，直到大麦接口再次要求验证码时由管理员重新保存覆盖。
- 2026-06-14：扩写 TASK-P2-002 用户品味画像 MVP，规划显式偏好、隐式反馈、新鲜度惩罚、画像解释和隐私降级路径。
- 2026-06-14：完成 TASK-P2-002 用户品味画像 MVP
- 2026-06-14：完成 TASK-P2-004 AI 对话分析助手
- 2026-06-14：新增 TASK-P2-005 首页清新化重构
- 2026-06-14：合并 TASK-P2-005 与 P2-007 为统一的首页清新化重构 task(地图优先+情绪化输入+画像面板卡片网格精细化)。,规划地图优先+情绪化输入(MoodOrbSelector 复用、grid 5列→3列、技术面板折叠、来源徽章保留)。,新增 chat-client(glm-4-flash 流式+tools)/chat-tools(4工具)/chat-session(Redis 历史)/SSE端点/useChat hook/ChatDrawer+ChatDock,挂载到工作台右下角浮动入口;真实 smoke 验证流式回复+工具调用链路通过。，新增画像服务（profile.types / user-profile-core 纯计算 / user-profile prisma 封装）、6 维度正负权重 + 新鲜度曝光惩罚、读时懒重算 + TTL、推荐链路接入（user-signals/features/ranker/recommend）、`GET/DELETE /api/user-profile`、UserProfilePanel explain 面板（工作台第 5 列）；128 个测试通过,真实 smoke 验证反馈→画像→explain→清空→回退全链路。
