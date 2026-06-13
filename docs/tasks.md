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

### TASK-P2-002：用户品味画像

- 状态：`待审批`
- 负责人：待定
- 是否需要审批：是

待办：

- [ ] 持久化用户偏好。
- [ ] 根据用户反馈更新偏好。
- [ ] 对重复标签和重复地点加入新鲜度惩罚。
- [ ] 在确定性打分稳定后，再考虑 pgvector。

验收标准：

- [ ] 老用户与匿名用户会得到不同推荐。
- [ ] 负反馈会影响后续排序。
- [ ] 个性化能力具备明确降级路径。

审批记录：

- 审批人：
- 日期：
- 结论：

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
