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

- 状态：`待审批`
- 负责人：待定
- 是否需要审批：是

待办：

- [ ] 选择一个合规的公开活动来源。
- [ ] 记录该来源的使用条款、限流规则和允许用途。
- [ ] 按现有 `CitySourceAdapter` 接口实现 adapter。
- [ ] 解析标题、时间、地址、标签、来源 URL 和热度信号。
- [ ] 当页面为空或结构变化时，提供可降级处理。

验收标准：

- [ ] 至少一个真实来源可以为 Demo 提供活动数据。
- [ ] 来源 URL 被保留，便于结果追溯。
- [ ] 禁用该 adapter 后，推荐系统仍可正常工作。

审批记录：

- 审批人：
- 日期：
- 结论：

### TASK-P1-003：接入 LLM 推荐解释层

- 状态：`待审批`
- 负责人：待定
- 是否需要审批：是

待办：

- [ ] 补充 `OPENAI_API_KEY` 配置说明。
- [ ] 在调用 LLM 前保持推荐候选结果确定。
- [ ] 只向 LLM 发送已选路线的事实信息。
- [ ] 加入超时控制和本地解释降级。
- [ ] 防止 LLM 编造地点、活动或来源信号。

验收标准：

- [ ] LLM 解释只引用返回路线中的地点和信号。
- [ ] 超时或缺少密钥时，系统回退到本地解释。
- [ ] 不配置 LLM 密钥时，构建和 API 仍然通过。

审批记录：

- 审批人：
- 日期：
- 结论：

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

### TASK-P1-006：地图优先的推荐工作台 UI 迭代

- 状态：`待审批`
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

计划触达文件：

- 修改：`components/RecommendationWorkspace.tsx`
  - 重组首页布局为左侧输入栏、中间地图工作区、右侧路线 inspector。
  - 增加选中路线状态，支持 Route 1 / Route 2 / Route 3 切换。
  - 保留现有 `POST /api/recommend` 调用和反馈链路。
- 新增：`components/city/RouteMapCanvas.tsx`
  - 渲染地图式路线画布、3 条路线线条、编号 marker、地图工具按钮和顶部图例。
  - 首版使用 CSS 网格与路线 polyline 风格表达，不新增外部依赖。
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

- [ ] 阶段 1：布局骨架
  - 将首页改成左侧 control rail、中间 map workspace、右侧 route inspector。
  - 桌面端优先匹配图二；移动端降级为输入、地图、路线详情纵向堆叠。
- [ ] 阶段 2：地图可达性表达
  - 在 `RouteMapCanvas` 中显示 3 条路线，Top route 使用 teal 高亮，其他路线使用 coral/amber。
  - 显示路线编号 marker、简化地图网格、地图工具按钮、图例和交通状态。
  - 顶部加入指标条：Candidate Pool、Amap ETA Calls、Traffic Rerank、Top Route Score、Cache Hits。
- [ ] 阶段 3：右侧路线 inspector
  - 支持 Route 1 / Route 2 / Route 3 切换。
  - 展示推荐分、总时长、交通耗时、距离摘要、站点列表、AI 解释、来源信号和反馈按钮。
  - 明确展示“因实时 ETA 更优提升排序”的产品文案。
- [ ] 阶段 4：底部路线时间轴
  - 将选中路线的 3 个地点串成时间轴。
  - 展示每段出行时间、交通状态和地点标签。
  - 与 inspector 选中状态保持同步。
- [ ] 阶段 5：状态与降级
  - 推荐生成中显示地图和 inspector 的加载状态。
  - 无路线时显示可理解空状态。
  - 交通 provider 为估算值时，明确显示降级状态，避免误导为真实高德数据。
- [ ] 阶段 6：验证
  - 运行 `pnpm typecheck`。
  - 运行 `pnpm lint`。
  - 启动 `pnpm dev` 并用浏览器检查桌面与移动端布局。
  - 检查控制台无明显错误，生成路线和反馈按钮仍可用。

验收标准：

- [ ] 首页首屏以地图工作区为视觉中心，而不是路线卡片列表。
- [ ] 用户可以从左侧输入偏好并生成 3 条路线。
- [ ] 3 条路线在地图画布中同时可见，当前 Top route 视觉优先级最高。
- [ ] 右侧 inspector 可以切换 3 条路线，并展示 ETA、站点、来源信号、AI 解释和反馈按钮。
- [ ] 顶部指标条能解释推荐链路：候选池、ETA、交通重排、最高分、缓存。
- [ ] 不新增数据库 migration，不改变 `/api/recommend` 和 `/api/feedback` 的现有 API 契约。
- [ ] 桌面端 `1440 x 1024` 视口下接近图二的信息层级；移动端不出现文字重叠或横向溢出。
- [ ] `pnpm typecheck`、`pnpm lint` 通过。

风险与降级：

- 如果真实高德地图主视图接入超出时间预算，首版使用静态地图式路线画布，并保留路线详情页的真实高德地图能力。
- 如果路线 polyline 数据不足，首版用稳定的 mock route geometry 仅作 UI 表达，不改变推荐排序事实。
- 如果 inspector 与 `RouteCard` 反馈逻辑出现重复，优先抽出共享反馈组件，避免两个 UI 入口产生不一致行为。

审批记录：

- 审批人：
- 日期：
- 结论：

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
- [ ] 审查并批准 `TASK-P1-006`。

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
