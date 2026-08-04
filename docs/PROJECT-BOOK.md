# Project CitySense（城市脉搏）

> 一个城市实时信号驱动的 AI 路线推荐系统。
>
> 用 AI 重新唤醒城市的真实脉搏，为每一个被困在信息茧房里的人，找回探索这座城市的惊喜——并产出 **3 条此刻就能出门执行的探索路线**。
>
> 版本：v1.0 · 日期：2026-06-16

---

## 目录

- [一、项目背景：你是否也曾有过这样的瞬间？](#一项目背景你是否也曾有过这样的瞬间)
- [二、我们的解决方案：一个有生命的"城市大脑"](#二我们的解决方案一个有生命的城市大脑)
- [三、技术架构](#三技术架构)
- [四、解决的痛点](#四解决的痛点)
- [五、产品特点：可被 AI Agent 调用](#五产品特点可被-ai-agent-调用)
- [六、未来规划](#六未来规划)
- [附录](#附录)

---

## 一、项目背景：你是否也曾有过这样的瞬间？

### 1.1 被算法困住的城市生活

在无数个周末或夜晚，你渴望逃离屏幕，去体验一些真实、有趣、不那么"网红"的活动。但当你打开手机，算法推荐给你的，却永远是那些逛腻的商场、千篇一律的连锁店和早已爆满的电影院。

我们似乎生活在一个**信息爆炸的时代**，却讽刺地陷入了**"不知道做什么"的虚无感**。我们受够了这种被动、失真、被商业逻辑绑架的城市生活。我们相信，技术不应是筑起信息茧房的砖墙，而应是**打破壁垒、通向无限精彩的桥梁**。

### 1.2 现有工具为什么解决不了这个问题

我们梳理了用户当前的工具组合，发现一个被忽视的核心矛盾——**没有任何一个工具回答"今晚该按什么顺序去哪几个地方"**：

| 维度 | 普通地图 / 大众点评 / 小红书 | 用户真正需要的 |
|---|---|---|
| **输出形态** | 单个地点、一篇笔记、一个榜单 | "今晚该按什么顺序去哪几个地方"的**可执行路线** |
| **数据维度** | POI 信息、静态评分 | POI + **社交实时热度** + **实时交通** + **此刻可达性** |
| **推荐逻辑** | 关键词匹配 / 商业排名 | 多源信号融合 + 交通重排 + **可追溯**的推荐理由 |
| **个性化** | 弱，或被商业逻辑绑架 | 真正懂我的**长期品味画像** |
| **信任度** | 黑盒，怀疑是广告 | 每条推荐都能回答**"为什么是这个、为什么是现在"** |
| **时间感知** | 静态距离 / 直线估算 | 此刻出发**赶不赶得上**、活动**还剩多久** |

**根本原因**：不是没有信息，而是信息**散落在七八个 App 里、彼此割裂、无法被组合成"现在就能出门执行的方案"**。用户成了数据和工具之间的"人工编排器"——打开小红书找热度、切到大麦看演出、跳到高德算路线、再回大众点评看评价——承担了本该由系统完成的整合负担。

### 1.3 CitySense 的定位

CitySense 不是一个"找地点"的工具（高德、大众点评已经做得很好），而是一个**城市实时信号驱动的 AI 路线推荐系统**。

它回答的核心问题是：

> *"我现在想出门，应该按什么顺序去哪几个地方？为什么是这几个？为什么是现在？"*

它要构建的是一个**能听到城市心跳、感知城市呼吸、真正懂你的"城市大脑"**——而它的产出，是 **3 条此刻就能出门执行的探索路线**：每条路线包含 2-3 个有序站点、真实分段交通耗时、可追溯的来源信号、以及 AI 生成（但不编造）的推荐理由。

### 1.4 项目目标与边界

**目标（已实现的核心闭环）：**

1. 用户可以输入偏好（兴趣/心情/预算/时间窗口/出发地），获得 3 条路线。
2. 推荐结果是**可执行路线**，不是地点列表。
3. 每条路线展示**真实交通耗时、平台来源信号、推荐理由**。
4. 高德实时交通数据**进入推荐排序**，而不只是地图装饰。
5. 多源数据**提前沉淀入库**，推荐接口不实时爬虫、不阻塞。

**明确不做的事**（保持聚焦）：

- 不做又一个 POI 搜索（高德/点评已足够好）。
- 不做实时爬虫阻塞推荐接口。
- 不把未确认的社交信号（小红书合集/攻略）污染路线。
- 不让 LLM 凭空推荐地点或编造事实。

---

## 二、我们的解决方案：一个有生命的"城市大脑"

我们的核心是构建一个**动态知识图谱**。它不是冰冷的数据库，而是能**实时感知、学习和推理**的城市大脑，具备三种生命能力：

### 2.1 它能听到心跳 —— 全城事件聚合

> "聚合全城的事件——从 Livehouse 的最新排期、小众艺术展的开幕，到街角的快闪店、社区的读书分享会。不再错过任何一个有趣的脉动。"

CitySense 通过多源接入层，把散落在各平台的事件脉搏汇聚成实时刷新的城市活动图谱。**每个数据源都有清晰的角色定位**，不是一股脑塞进来：

| 数据源 | 接入方式 | 角色 | 限流/降级 |
|---|---|---|---|
| **高德 POI** | Web API (`v3/place/text`) | **地点权威**——路线 marker、可达性、坐标都以此为准 | cooldown + 缓存 |
| **上海政务公开** | 爬虫（公开页面） | **活动权威**——官方认证的市集/文化活动资讯 | cooldown 30min |
| **大麦** | 爬虫（cookie 插件） | **活动信号**——演出/展览排期，仅产出 Event | 验证码→人工重验 |
| **小红书** | MCP (`ai_search_chat`) | **趋势证据**——热度信号，经审查绑定高德地点后才参与推荐 | LLM 审查绑定 |
| **B 站** | MCP | 趋势证据 | 同上 |
| **Trends Hub** | MCP (`mcp-trends-hub`) | 微博/知乎/头条/澎湃热榜 | maxItems 限制 |

**关键设计**：社交平台（小红书/B站/Trends Hub）**永远不是地点权威**。它们只贡献"哪里正在变热"的证据，必须经过"算法筛选 + LLM 审查"绑定到确认的高德 Venue 后，才能影响推荐（详见 §3.7）。

### 2.2 它能感知呼吸 —— 实时状态感知

> "引入实时状态——通过社交媒体挖掘情绪热力图，结合天气、交通数据判断人流密度与可达性。它知道哪里安静，哪里热闹，哪里最适合此刻的心情。"

CitySense 把静态的 POI 数据，升级为**带有时间维度和状态维度的活数据**：

- **实时交通感知（已实现）**：高德 ETA 判断此刻可达性——不是直线距离，而是"现在出发，路上 22 分钟，展览还剩 2 小时，赶得上"。交通分**直接进入排序权重**（`traffic` 特征 0.09），不是地图装饰。
- **分段路径规划（已实现）**：对最终 3 条路线逐段调用高德（origin→站点1→站点2→站点3），返回真实分段耗时、公交线路名、道路级 polyline。时间轴显示"22 min · 71路(申昆路枢纽站--延安东路外滩)"。
- **社交情绪热力（规划中）**：对已入库文本做 LLM 情绪分类（positive/neutral/noisy/calm/hyped）。
- **人流/安静度估算（规划中）**：融合高德拥堵状态、POI 热度、同区域信号密度，可解释地估算"那里现在挤不挤"——明确标注为估算，不宣称真实客流。
- **天气感知（已实现于对话助手）**：天气状态进入路线解释（"今晚有雨，路线优先减少室外步行段"）。

### 2.3 它能真正懂你 —— 尊重隐私的深度个性化

> "构建一个尊重隐私、深度个性化的用户图谱。通过你授权的小红书 mcp、豆瓣、B 站等平台的品味数据，真正理解你对音乐、电影、书籍的偏好，而不是简单粗暴地给你贴标签。"

不靠黑盒模型，而是构建**可解释、可审计、可清空**的长期品味画像：

- **三维刻画**：正偏好 + 负偏好 + 新鲜度——不仅知道你喜欢什么，还知道你反感什么、最近看腻了什么。
- **6 个维度**：tag（兴趣）、source（来源）、area（区域）、price（预算）、quietness（氛围）、popularity（热闹度）。
- **时间衰减**：正反馈 4 档（1d→1.0 / 7d→0.72 / 30d→0.42 / 90d+→0.18）；负反馈 venue 维度用更短半衰期（7d→0.5），因为"不喜欢这条路线"未必是"不喜欢这个地点"。
- **防过拟合**：最小样本阈值（<5 返回中性 50）、单维度权重上限（正 60 / 负 30）、负偏好需 ≥2 样本才泛化。
- **冷启动**：匿名用户有 `recentExposure` 多样性补偿（itemId 命中 -8、routeTitle 命中 -4），避免反复看到相同 Top 路线。
- **可解释**：推荐 meta 返回 `userProfile.topPositive/topNegative`（如 `tag:展览 +8`、`recentlySeen:venue -6`）。
- **可清空**：`DELETE /api/user-profile` 清空画像，推荐回到无画像中性状态。
- **隐私红线**：area 仅区级粒度，不存精确坐标；不存原始平台私密内容；画像可一键清空；LLM 不得推断敏感属性；授权品味导入只保留脱敏摘要（title 截断 60、tags 限 10×40、sourceItemId 仅哈希）。

### 2.4 最终的产物：3 条可执行的路线

它像一个最懂你的朋友，给你这样的建议：

> *"嘿，3 公里外那家你关注过的独立书店，正在办一场你肯定会喜欢的漫画原稿展，还有 2 小时就结束了。天气不错，现在出发，我帮你规划了一条不堵车的路线，逛完正好可以去旁边那家手冲咖啡坐坐。"*

**这不是 LLM 生成的营销文案，而是由真实数据链路支撑、每个字都可追溯的推荐：**

| 文案片段 | 数据来源 |
|---|---|
| "3 公里外那家独立书店" | 高德 POI 确认的真实地点 + 实时距离计算 |
| "漫画原稿展，还有 2 小时结束" | 政务/大麦活动源 + 活动结束时间 |
| "你肯定会喜欢" | 用户画像里"展览"标签的正反馈权重（`userAffinity` 特征） |
| "不堵车的路线" | 高德实时 ETA 交通重排（`traffic` 特征） |
| "旁边那家手冲咖啡" | 路线组合算法的连贯性（`routeContinuity`）与多样性（`routeDiversity`）计算 |

---

## 三、技术架构

### 3.1 总体架构图

```txt
┌─────────────────────────────────────────────────────────────────┐
│                      前端（Next.js App Router）                   │
│   推荐工作台 · 路线详情页 · AI 对话助手 · 数据源管理 · 用户画像     │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTP / SSE
┌────────────────────────────▼────────────────────────────────────┐
│                    API Orchestrator（Next.js API Routes）         │
│  /api/recommend  /api/routes/:id  /api/feedback  /api/city-pulse │
│  /api/chat(SSE)  /api/user-profile  /api/ingest/*  /api/amap/*   │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────▼────────────────────┐
        │           推荐引擎 (Recommendation)      │
        │  多路召回→特征(11维)→排序→交通重排→      │
        │  路线组装→分段leg→LLM解释→持久化快照     │
        └──────┬──────────────────────────┬───────┘
               │                          │
   ┌───────────▼──────────┐    ┌──────────▼──────────────────┐
   │  Supabase Postgres   │    │     高德 Web 服务 API          │
   │  (Prisma, 14 模型)    │    │  ETA·分段路径·地理编码·天气    │
   └───────▲──────────────┘    └─────────────────────────────┘
           │
┌──────────┴─────────────────────────────────────────────────────┐
│         Source Adapter / MCP Client（后台采集层）                │
│  高德POI·上海政务·大麦·小红书MCP·B站MCP·TrendsHub                │
│  → raw_source_items → LLM归一化 → Event/Venue/CitySignal        │
│  → 社交信号经 算法Top-K+LLM审查 绑定高德Venue                    │
│  调度: BullMQ+Redis ｜ Worker: ingest / normalize               │
└─────────────────────────────────────────────────────────────────┘
```

整个系统遵循一个清晰的责任分层：**前端负责体验，API 负责编排，推荐引擎负责决策，数据库负责事实，采集层负责沉淀信号**。每一层都不越权——前端不直接调推荐算法，推荐接口不实时爬虫，LLM 不改变路线事实。

### 3.2 技术栈

| 层 | 技术选型 | 选型理由 |
|---|---|---|
| **前端** | Next.js 16 (App Router) + React 19 + TypeScript | 地图优先多栏工作台；前后端同构，API 与页面同仓库 |
| **地图** | 高德地图 JS API 2.0 | 国内路线渲染、polyline、marker、交通状态 |
| **后端** | Next.js API Routes + 纯函数 `server/` 层 | 推荐主链路全服务端完成；纯函数可被 MCP/测试直接 import |
| **数据库** | Supabase Postgres + Prisma 6.19 ORM | 候选库+快照+反馈事实表，托管免运维；专用 prisma 用户连接 |
| **召回增强** | `pg_trgm` + Postgres Full-Text Search | 模糊匹配（错别字/简称）+ 自然语言文本召回，不增加新服务 |
| **交通** | 高德 Web 服务 API（方向 API v3） | walking/transit/driving ETA + 分段 steps + polyline |
| **LLM** | OpenAI 兼容（glm-4-flash / gpt-5.5） | 解释 + 归一化 + 对话，三层职责隔离 |
| **任务队列** | BullMQ + Redis | 异步采集归一化解耦，不阻塞推荐接口 |
| **MCP** | Model Context Protocol SDK | 双向：对外 7 工具 / 对内消费平台信号 |
| **部署** | Docker + Vercel（规划中） | MCP HTTP 模式独立容器化 |

### 3.3 推荐主链路（系统核心）

实时推荐链路遵循一个铁律：**不直接爬取外部平台，不实时调用 MCP，只对 Top-N 候选调用高德**。Source Adapter 和 worker 负责提前把城市信号沉淀进数据库；推荐 API 只读取规范化数据。

```txt
POST /api/recommend  →  recommend(input)
  │
  ├─① zod 解析 + 高德地理编码(起点)
  │     recommendRequestSchema 校验；originAddress 经 geocodeAddress 解析为坐标
  │
  ├─② 多路召回 retrieveDatabaseCandidates
  │     ├─ base 召回：Event+Venue 按 city/area/interest 过滤(take 50+50)
  │     ├─ text 召回：pg_trgm similarity > 0.08 模糊匹配(take 30+30)
  │     ├─ city-signal 召回：CitySignal + confirmed 匹配的高德 Venue
  │     ├─ city-fallback：区域内候选不足时同城兜底
  │     └─ actionable-supplement：高德POI/政务可执行候选补充
  │     → 去重(routeEligible优先) → 取 Top 80 召回窗口
  │
  ├─③ 特征计算 createDefaultFeatures (11 维 CandidateFeatures)
  │
  ├─④ 规则排序 rankCandidates → weighted-v1.2-profile
  │     → selectTrafficCandidatesForEnrichment 取 Top 20(routeEligible优先)
  │
  ├─⑤ 交通重排 enrichAndRerankByTraffic
  │     按场景选出行方式(now+area=walking / date=driving / 默认transit)
  │     仅对 Top-N 调高德 ETA，命中 TrafficSnapshot 缓存
  │     → adjustedScore 重排
  │
  ├─⑥ 路线组装 buildRoutes
  │     从 Top 20 穷举 2-3 点组合(pairs + 可选 triples)
  │     每个组合算 routeScore，最近邻排序站点
  │     选 3 条(首站/标签多样性约束，去重同地点簇)
  │
  ├─⑦ 分段路径 planRoutesLegs
  │     对最终 3 条路线逐段调高德(origin→s1→s2→s3)
  │     解析 steps(指令/道路/耗时) + polyline(下采样240点)
  │     缓存进 TrafficSnapshot.rawPayload，无 migration
  │     → 真实分段耗时 + 公交线路名 + 道路级 polyline
  │
  ├─⑧ LLM解释 explainRoutes
  │     仅引用已选路线事实 + 去重后首条 sourceContext
  │     结构化 JSON schema + citation 校验
  │     失败/超时/路线外引用 → 回退本地模板
  │
  ├─⑨ 持久化 persistRecommendationSnapshot
  │     recommendation_logs(输入+路线快照)
  │     RecommendationFeatureSnapshot(11维特征，可离线评估)
  │
  └─⑩ 返回 3 条路线 + meta
        meta: ranker / rankerVersion / candidateCount / trafficProvider
              (amap|estimated) / recallChannels / profileApplied / origin
```

**关键工程约束（已硬性落实，写在代码注释与测试里）：**

1. **推荐接口不实时爬虫**——所有数据读自 `Event` / `Venue` / `CitySignal` 表。
2. **高德 API 只打 Top-N 候选**（`TRAFFIC_ENRICHMENT_LIMIT = 20`），有 `TrafficSnapshot` 缓存兜底。
3. **LLM 不凭空推荐地点**——只在链路末端改写 `reason/tips`，不改变路线、排序、地点。
4. **每条推荐可解释、可追溯、可降级**——外部依赖全部失败时，本地模板解释 + 估算交通仍能闭环。

### 3.4 排序模型：weighted-v1.2-profile

采用**确定性加权排序**（非黑盒 ML），正权重之和严格 = **1.00**（真正的加权平均：全 100→100，全 50→50，全 0→0），分数区分度不被压缩。有单测 `recommendation-weights.test.ts` 守护。

**为什么不用 ML？** 当前数据量、反馈量和阶段都不支持直接上复杂模型。先用确定性规则保证可解释、可调参、可回滚，等反馈数据足够后再考虑 learning-to-rank（且必须离线指标显著优于当前才接入）。

**候选级 11 维特征（`scoring.ts`）：**

| 特征 | 权重 | 含义 | 数据来源 |
|---|---:|---|---|
| `actionability` | 0.18 | **可执行性质量门**（有地址+坐标才高分） | address/lat/lng + qualityFlags |
| `userAffinity` | 0.18 | **用户画像匹配**（最强正向维度之一） | UserPreference 6 维度画像 |
| `taste` | 0.16 | 兴趣+心情+预算匹配 | input + tags/quietness |
| `distance` | 0.10 | 距离衰减分档（≤1.2km→96, ≤3km→82...） | origin → 候选坐标 |
| `traffic` | 0.09 | 实时交通可达性 | 高德 ETA / 估算降级 |
| `socialTrend` | 0.08 | 平台热度信号 | trendScore / CitySignal |
| `textRelevance` | 0.07 | pg_trgm 文本相关性 | similarity > 0.08 |
| `freshness` | 0.06 | 新鲜度（≤1d→90, ≤7d→78...） | startTime/createdAt |
| `timeFit` | 0.05 | 时间窗口匹配 | timeWindow + 活动时间 |
| `novelty` | 0.03 | 小众度/新鲜感 | popularity + confidence |
| `feedbackPenalty` | -0.10 | 负反馈惩罚 | dislike/dismiss |
| `exposurePenalty` | -0.05 | 曝光新鲜度惩罚 | 近期 RecommendationLog |

> **正权重求和校验**：0.16+0.07+0.08+0.06+0.10+0.09+0.05+0.03+0.18+0.18 = **1.00**。

**路线级评分（`route-builder.ts`，从 Top 候选穷举 2-3 点组合）：**

```txt
routeScore =
  avg(candidateScore)    * 0.50 +   // 候选质量主导(归一化后提升主导地位)
  requestCoverage        * 0.15 +   // 请求兴趣覆盖(避免"低预算"退化成纯咖啡)
  themeCoherence         * 0.13 +   // 主题连贯(quietCulture/nightlife/marketFood)
  routeContinuity        * 0.12 +   // 路线连贯(站点间平均距离分档)
  sourceEvidence         * 0.05 +   // 来源证据强度
  trafficEfficiency      * 0.03 +   // 交通效率
  timeFit                * 0.01 +   // 时间契合
  routeDiversity         * 0.01     // 主题多样性
```

最终选出 **3 条路线**，要求首站和核心标签尽量不同（`firstPlaceIds` / `tagSignatures` 去重约束），避免给用户三个"咖啡线"。同地点簇（同 venueId / 同门牌号 / 名称包含）会被去重，避免同一演出场馆和高德 POI 拼进同一条路线。

### 3.5 数据模型（14 个，对应城市大脑能力）

知识图谱的核心实体，全部沉淀在 Supabase Postgres：

| 模型 | 角色 | 关键字段 |
|---|---|---|
| `Event` | 活动（展览/演出/市集） | title/startTime/endTime/venueId/trendScore/qualityScore |
| `Venue` | 地点（高德 POI 权威） | name/lat/lng/address/quietness/popularity/priceLevel |
| `CitySignal` | 城市热度信号（按 tag/area 聚合） | tag/heatScore/source/capturedAt |
| `CitySignalPlaceMatch` | **社交信号→高德地点的可审计匹配** | status/algorithmScore/llmConfidence/matchedFields/reason |
| `RawSourceItem` | 原始采集记录（数据血缘） | source/sourceKey/rawPayload/parsedPayload/status |
| `IngestRun` | 采集任务批次 | city/keywords/sources/status/stats |
| `SourceConnector` | 数据源连接器状态 | status/enabled/cooldownSeconds/lastSuccessAt |
| `TrafficSnapshot` | 高德 ETA 缓存（含分段 leg） | origin/dest/mode/duration/rawPayload |
| `UserPreference` | 用户画像快照 | userId/interests/metadata(完整画像)/profileVersion |
| `UserInteraction` | 用户行为事件 | action/weight/context/tags/area |
| `RecommendationLog` | 推荐快照 | input/recommendedRoutes/feedback |
| `RecommendationFeatureSnapshot` | 每次推荐的完整特征快照 | ranker/features/score/position |
| `RecommendationFeedback` | 路线级反馈事实表 | value(up/down/save/dismiss)/reason |

### 3.6 数据采集流水线（"听到心跳"的实现）

```txt
外部平台 ──MCP/爬虫/API──▶ Source Adapter
  │
  ├─① raw_source_items 原始入库（先入库，不等解析）
  │     executeIngestRun 只做搜索 + upsert，run stats 的 normalized/citySignals=0
  │
  ├─② LLM 归一化（normalize worker 异步处理）
  │     结构化 JSON schema 校验
  │     source/sourceUrl/sourceKey/imageUrl 为系统保留字段，LLM 不得改写
  │
  ├─③ Event / Venue / CitySignal 写入
  │     可空字段用 null 清理旧值，避免 stale area/address 残留
  │
  └─④ 社交信号（小红书/B站）→ 高德地点匹配
        算法 Top-K 筛选高德 Venue
        → LLM 审查（confirmed / ambiguous / rejected / topic_only）
        → 仅 confirmed 的叠加到对应 Venue 的 sourceSignals 和 signalStrength
        → 未确认的永不进入路线候选 / marker / 排序
```

**"先采集入库，后解析"的解耦设计**：这是保证推荐接口不被外部依赖拖慢的关键。采集成功但解析慢，不会阻塞推荐；单条解析失败，不会让整批入库失败。`RawSourceItem.status="new"` 表示待解析，normalize worker 可按 `source` / `ingestRunId` / `limit` 分批后处理。

**大麦的特殊处理（crawler source）**：管理员在 `/admin/sources` 完成浏览器验证码，保存过滤后的**匿名搜索 cookie**（只接受 `damai.cn` 域，丢弃 nick/user/login 等账号态 cookie）；worker 用 cookie 采集，大麦内容**只产出 Event**，venueName 仅作地点线索，必须经高德 POI 匹配确认后才参与路线。API/UI 只展示 cookie 状态/数量/时间，不返回 cookie 值。

### 3.7 "感知呼吸"：社交信号可信化流水线

这是 CitySense 区别于"把小红书热帖直接当地点"的庸俗方案的关键。社交内容泛化、合集化（"上海必逛的 10 家咖啡馆"），直接当地点会产生大量虚假地点。CitySense 用**"算法筛选 + LLM 审查"两段式匹配**：

1. **算法 Top-K 筛选**（`social-place-matcher.ts`）：从高德 `Venue` 中按城市、区域、名称相似、地址 token、标签/类型、坐标距离筛 Top-K 候选；过滤票务中心、售票点、购物广场、管理公司等非演出 POI。
2. **LLM 审查**：只在 Top-K 内做 `confirmed` / `rejected` / `ambiguous` / `topic_only` 判断，**不得编造新地点、不得返回 Top-K 之外的 venueId、不得改写高德坐标/地址/sourceUrl**。低置信度、候选外 venueId、泛化合集、证据不足均降级。
3. **可审计产物**：`CitySignalPlaceMatch` 记录 `algorithmScore`、`llmConfidence`、`matchedFields`、`reason`、`status`，全部可在数据库或 admin 排查路径追溯。
4. **零信任默认**：没有 `confirmed` 匹配的小红书内容，**不进入路线候选、不显示 marker、不参与排序、不做 ranker boost**。宁可少用信号，也不让不可执行地点污染路线。

**质量门（`quality.ts`）**：每个候选都有 `qualityScore` + `qualityFlags` + `routeEligible` 三元组。`generic_social`（合集/攻略/清单/必逛/抄作业）和 `social_signal_only`（小红书直接来源）会被压制，只有具备地址或坐标、质量分 ≥ 55 的候选才是 `routeEligible`，才能进入路线。

### 3.8 LLM 治理：三层职责隔离 + 事实绑定

LLM 在 CitySense 里有四个完全隔离的角色，**任何一个都不能越权改变推荐事实**：

| 角色 | 模型 | 职责 | 边界 |
|---|---|---|---|
| **解释层** | gpt-5.5 (Responses API) | 改写路线 `reason/tips` | 只引用已选路线事实；citation 校验失败回退本地模板 |
| **归一化层** | gpt-5.5 | 把 raw item 解析成结构化 Event/Venue | `source/sourceUrl/sourceKey/imageUrl` 为系统保留字段，不可改写 |
| **对话助手** | glm-4-flash (chat completions) | 自然语言问答 | function calling 调 8 工具，绝不编造地点 |
| **匹配审查** | gpt-5.5 | 社交信号→高德地点审查 | 只在算法 Top-K 内判断，不编造新地点 |

**统一降级链**：缺 key / 超时 / HTTP 失败 / payload 非法 / citation 校验失败 → 全部回退本地确定性逻辑，推荐闭环不报错。

**citation 校验机制**：LLM 输出必须返回 `routeId`、`citedPlaceIds`、`citedSignalSources`；合并前校验 citation 是否属于同一条返回路线，发现路线外地点、未知 source 或 URL 时回退本地解释。

### 3.9 项目结构

```txt
CitySense/
├── app/                # Next.js App Router（页面 + API 路由）
│   ├── api/            # recommend / routes / feedback / city-pulse / chat / ...
│   └── routes/[id]/    # 路线详情页
├── components/         # 工作台/地图画布/路线inspector/时间轴/画像面板/AI助手
├── server/             # 后端纯函数（可被 MCP/测试直接 import）
│   ├── recommendation/ # 召回/特征/排序/路线/画像/信号融合/质量
│   ├── sources/        # adapter（高德/政务/大麦/小红书/B站/TrendsHub）+ MCP client
│   ├── ingest/         # 采集流水线/LLM归一化/社交地点匹配
│   ├── maps/           # 高德ETA/分段leg/地理编码/天气/交通缓存
│   ├── ai/             # 解释/归一化/对话（chat-tools 8工具）
│   └── mcp/            # MCP Server（对外 7 工具）+ tools/
├── workers/            # ingest / normalize / traffic-refresh
├── prisma/             # schema + 14 模型 + seed（22+ 上海 Demo 数据）
├── tests/              # 192+ 单元测试
└── docs/               # PRD/设计/API/推荐规划/任务/MCP/Supabase
```

---

## 四、解决的痛点

### 4.1 用户侧痛点

#### 痛点 1：决策疲劳 —— "不知道做什么"

**传统**：在小红书、大众点评、高德之间反复切换，刷大量内容却无法决策。

**CitySense**：输入**兴趣 + 心情 + 预算 + 时间窗口 + 出发地**，直接输出 **3 条可执行路线**。每条路线含 2-3 个有序站点、真实分段交通耗时、推荐理由、公交线路名。用户从"人工编排七八个 App"变成"输入一次，拿到方案"。

#### 痛点 2：推荐不可信 —— "为什么推这个给我，是不是广告"

**传统**：算法黑盒，怀疑是商业榜单或随机拼接。

**CitySense**：
- 每个地点标注**数据来源**（高德 POI / 小红书趋势 / 政务活动 / 大麦演出）。
- 每条路线有**来源信号徽章** + **交通可信度**（高德真实 vs 估算降级，UI 显式区分）。
- LLM 解释**只引用已选路线事实**，citation 校验失败回退模板，绝不编造。
- 用户画像影响**可解释**：`tag:展览 +8`、`source:damai +3`、`recentlySeen:venue -6`。

#### 痛点 3：推荐不实时 —— "到了发现去不了 / 已经结束了"

**传统**：基于静态距离或直线估算，不考虑此刻拥堵、活动剩余时间。

**CitySense**：
- 高德 API 实时计算 **ETA + 分段路径**（步行/公交/驾车），时间轴显示每段**真实耗时和公交线路名**。
- 交通分会**直接影响排序**（不只是地图装饰）——这是产品第一眼要传递的核心信息。
- 活动时间冲突时自动降权（"展览还剩 2 小时，现在出发刚好"）。

#### 痛点 4：不够懂我 —— "每次都推一样的 / 推的都不是我喜欢的"

**传统**：冷启动严重，无个性化或个性化黑盒。

**CitySense**：站内反馈（有帮助/不合适/收藏）累积成**可解释、可清空**画像；6 维度正负+新鲜度；匿名用户冷启动多样性补偿（避免反复看到相同 Top 路线）；老用户、匿名会话、无画像用户行为有清晰差异。

### 4.2 技术侧痛点

#### 痛点 5：实时爬虫阻塞推荐 → 延迟高、易失败、成本不可控

**CitySense**：**采集与推荐彻底解耦**。Source Adapter + Worker 提前沉淀信号；推荐接口只读数据库；高德 ETA 只打 Top-N，有缓存；外部依赖失败优雅降级。

#### 痛点 6：社交数据不可信 → "虚假地点"污染路线

**CitySense**：算法 Top-K + LLM 审查两段式匹配。小红书不直接生成地点，必须绑定 confirmed 高德 Venue 才参与推荐；未确认的永不进入路线。匹配状态全部可审计。

#### 痛点 7：LLM 幻觉 → 编造地点/活动/时间/来源

**CitySense**：事实绑定 + citation 校验。LLM 只在链路末端改写文案，输入只有已选路线事实，输出过 schema + citation 校验，失败回退本地模板。`source/sourceUrl/imageUrl` 为系统保留字段。

#### 痛点 8：系统难维护、难追溯

**CitySense**：
- **开发者审批流程**：涉及数据库/用户数据/推荐权重/外部 API 的改动必须书面审批（审批人/日期/结论/完成记录全部入档）。
- **Feature Snapshot**：每次推荐保存完整 11 维特征快照，支持离线评估和调权。
- **rankerVersion 可追溯**：权重变更全程记录（`weighted-v1` → `weighted-v1.1-signal-backed` → `weighted-v1.2-profile`）。
- **城市脉搏面板**：实时展示来源占比、交通 provider、缓存新鲜度、反馈趋势、ranker 分布。
- **192+ 单元测试**：覆盖排序、画像、召回、路线组合、降级、MCP、对话等核心逻辑。

---

## 五、产品特点：可被 AI Agent 调用

除了作为独立的路线推荐产品，CitySense 还有一个独特的延展能力：**它把"感知城市现实"的能力封装成了标准接口，可以被 Claude、Cursor 等 AI Agent 直接调用。**

这源于一个观察：通用大模型 Agent（Claude、Cursor、ChatGPT、各类 coding agent）非常聪明，却对你的现实生活一无所知——它们不知道此刻静安哪里拥挤、不知道 3 公里外那家书店今晚有展览还剩 2 小时、不知道现在出发会不会堵车。**城市是实时的、地理锚定的、多源异构的，无法塞进 LLM 训练数据，只能通过工具调用动态获取。** CitySense 选择成为那个"城市感知"的工具。

### 5.1 双向 Agent 架构

```txt
   外部平台(小红书/B站/大麦...)  ──MCP──▶  CitySense (Client)  → 城市信号入库
                                                                     │
                                                  ┌──────────────────▼──────────────────┐
                                                  │       CitySense 城市大脑             │
                                                  │   (知识图谱 + 推荐引擎 + 画像)       │
                                                  └──────┬──────────────────┬───────────┘
                                                         │                  │
                                          MCP Server ────┘                  └──── 内置 AI 助手
                                          (对外 7 工具)                           (8 工具 function calling)
                                                 │                                  │
                                       Claude / Cursor                          产品网页工作台
                                       / 任意 MCP Agent                          (右下角浮动入口)   
```

- **作为 Client**：CitySense 调用小红书/B站等平台的 MCP，把城市信号采集入库。
- **作为 Server**：CitySense 把推荐/路线/城市脉搏/交通/反馈能力封装成 MCP 工具，让外部 Agent 感知这座城市。

两个 MCP 端点互不干扰，共享同一套城市大脑。

### 5.2 MCP Server：7 个工具

每个工具直连 `server/` 下纯函数，不走 HTTP 中转，零序列化损耗：

| 工具 | 读/写 | 让 Agent 能做什么 |
|---|---|---|
| `recommend_routes` | 写(快照) | 生成 3 条可执行路线——Agent 终于能回答"今晚去哪" |
| `get_route_detail` | 读 | 打开路线详情（地点/交通分段/来源信号）——追问"这条路线具体怎样" |
| `get_city_pulse` | 读 | 查城市脉搏（热门标签/来源占比/反馈趋势）——回答"最近流行什么" |
| `get_ingest_status` | 读 | 查数据源状态——回答"数据新鲜吗、可信吗" |
| `resolve_traffic` | 写(缓存) | 两点间 ETA/距离/拥堵——判断"现在去赶不赶得上" |
| `record_feedback` | 写 | 记录反馈——让 Agent 用户的偏好回流进画像 |
| `list_sources` | 读 | 列出数据源——Agent 入门首选，无需 DB |

每个工具带 MCP `annotations`（`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`），帮助 client agent 自主决策何时调用。

**两种部署模式：**

| | stdio（本地） | HTTP（远程） |
|---|---|---|
| 启动 | `pnpm mcp:server` | `pnpm mcp:http` |
| 连接方式 | agent spawn 子进程 | agent 填 URL + token |
| 鉴权 | 无（同机信任） | bearer token（`timingSafeEqual` 防时序攻击） |
| 适用 | 你自己、团队 clone 仓库 | 外部用户、跨网络、公网部署 |

**接入 Claude Desktop 只需 5 行配置**，配好后对话里说"用 citysense 推荐上海徐汇的咖啡路线"，Claude 自动调 `recommend_routes`——**用户的 AI 助手从此能感知这座城市的实时脉搏。**

### 5.3 内置 AI 助手：8 工具 function calling

产品内部还内置了基于 function calling 的 AI 对话助手（glm-4-flash + SSE 流式），用户不离开产品就能用自然语言探索城市：

| 工具 | 让用户能问什么 |
|---|---|
| `recommend_routes` | "今晚静安有什么好玩的" |
| `get_city_pulse` | "最近上海流行什么" |
| `get_route_detail` | "这条路线具体怎样、为什么推荐" |
| `get_user_profile` | "你了解我吗、我的偏好是什么" |
| `record_feedback` | "收藏这条路线 / 这条不错 / 不喜欢" |
| `get_weather` | "今天天气怎么样、周末会下雨吗、适合户外吗" |
| `search_activities` | "最近有什么展览、有没有音乐节" |
| `plan_multi_day` | "帮我规划两天的行程" |

工具直接复用同一套 `server/` 纯函数，与 MCP Server 行为一致。每个工具有 `summarize` 函数精简返回值控制 token，最多 3 轮 tool_calls 防失控。对话历史 Redis 持久化（24h TTL），多轮可续接。

### 5.4 Agent 调用的安全边界

1. **统一错误包裹**：失败 → `isError:true` + 简明 message，**绝不泄漏堆栈**。
2. **DB 守卫**：缺 `DATABASE_URL` 返回友好提示，不让 Prisma 抛异常。
3. **zod 入参校验**：非法输入不进推荐链路。
4. **写操作可控**：快照/反馈都是设计内可控写入，经 routeId 归属校验。
5. **admin 工具不暴露**：扫码登录/cookie 管理等高风险操作不通过 MCP 开放。
6. **降级链完整**：缺 key / 超时 / DB 不可用 → 结构化错误占位，Agent 据此告知用户，不崩溃。

> 这个特点让 CitySense 不只是一个"能用的产品"，更是一个"能被生态调用的能力"——同一套城市大脑，既服务终端用户，也服务所有 AI Agent。

---

## 六、未来规划

当前项目已完成完整的推荐闭环（数据采集 → 多路召回 → 排序 → 交通重排 → 路线组装 → 分段路径 → LLM 解释 → 反馈 → 画像）。下一阶段，继续把路线推荐做深做实。

### 6.1 短期：真实 MVP 补齐（P0）

| 任务 | 状态 | 内容 |
|---|---|---|
| ① 用户品味画像闭环 | ✅已完成 | 6维度+正负+新鲜度，推荐可追溯，可清空 |
| ② 实时城市状态 V0 | 待审批 | 天气/人流/情绪热力/新鲜度，新增 `CityConditionSnapshot` 表 |
| ③ 此刻可执行判断 | 待审批 | `whyNow`/`urgency`/`arrivalFit`/`weatherFit`/`crowdFit` |
| ④ 朋友式城市提醒卡 | 待审批 | 自然有时机感的建议，事实绑定不编造 |
| ⑤ 信号可信度显性化 | 待审批 | 高德确认/真实源/趋势证据/估算 各有可见状态 |

**实时城市状态 V0** 的目标是建立"城市呼吸"状态层，让系统回答"现在适不适合去、那里安不安静、附近热不热闹、天气是否影响路线"。所有状态必须有来源、时间戳、有效期和置信度；人流/情绪明确标注为估算，不宣称真实客流；天气 API 配额有限必须缓存。

### 6.2 中期：产品化打磨（P2）

| 方向 | 内容 | 触发条件 |
|---|---|---|
| **语义召回+向量画像** | pgvector + item embedding，语义召回（"适合发呆的地方"→安静书店） | 确定性画像稳定后 |
| **模型化排序** | XGBoost/LightGBM learning-to-rank，Python 侧车 | 反馈足够且**离线显著优于 weighted-v1** |
| **路线组合优化** | Google OR-Tools VRP（时间窗/预算约束） | 路线点数 5+ |
| **完整 OAuth 连接器** | 小红书/豆瓣/B站授权数据合规进画像 | 站内画像价值已证明 |
| **主动通知订阅** | "有合适活动时主动提醒" | 状态+画像+准确度稳定 |
| **多城市扩展** | 上海→北京/广州/深圳 | 地理配置+Demo+adapter+参数 |
| **MCP 工具扩展** | 城市状态/天气/多日规划持续开放给 Agent | 城市状态 V0 稳定 |

### 6.3 长期愿景

CitySense 的终极形态是一个**懂城市、懂用户、可信赖的城市探索 AI**：

- **城市侧**：融合天气/人流/情绪/活动/交通的实时"城市呼吸"感知层。
- **用户侧**：单次推荐 → 长期画像 → 主动时机场提醒 → 个人城市探索档案。
- **信任侧**：每条推荐可追溯、可解释、可降级。
- **生态侧**：同一套城市大脑，既服务终端用户，也作为标准能力被 AI Agent 调用。

### 6.4 明确"不做什么"

- ❌ 不马上引入完整 ML 推荐框架（数据量不支持）。
- ❌ 不先做协同过滤/learning-to-rank（冷启动严重）。
- ❌ 不长期保存平台原始私密数据。
- ❌ 不让 LLM 决定画像或排序。
- ❌ 不把估算人流包装成真实客流。
- ❌ 不做实时爬虫阻塞推荐。
- ❌ 不让未确认社交信号污染路线。

---

## 附录

### A. 核心 API 一览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/recommend` | POST | 生成 3 条可执行城市路线 |
| `/api/routes/:id` | GET | 路线详情、地图 polyline、站点 markers |
| `/api/feedback` | POST | 路线级反馈（up/down/save/dismiss） |
| `/api/ingest/run` | POST | 创建采集任务并入队 |
| `/api/ingest/status` | GET | 队列/连接器/采集任务状态 |
| `/api/city-pulse` | GET | 城市脉搏聚合 |
| `/api/chat` | POST/DELETE | AI 对话助手（SSE 流式 / 清空历史） |
| `/api/user-profile` | GET/DELETE | 画像摘要 / 清空画像 |
| `/api/amap/route` | POST | 获取或估算路线 ETA |

### B. 排序权重演进史

| 版本 | 日期 | 关键变化 | 正权重和 |
|---|---|---|---|
| `weighted-v1` | 2026-06-13 | 初始线性打分 | 1.00 |
| `weighted-v1.1-signal-backed` | 2026-06-13 | 引入信号背书 + 质量门 | 1.00 |
| `weighted-v1.2-profile` | 2026-06-14 | 引入画像层（userAffinity 0.35） | 1.34 |
| `weighted-v1.2-profile` | 2026-06-15 | 权重归一化（userAffinity→0.18） | **1.00** |

每次权重变更都经书面审批，记录在 `docs/tasks-2.md`，有单测守护。TASK2-P0-004 还修复了 trendScore 双重计数、激活了 area 画像维度、新增匿名冷启动 exposure。

### C. 开发者审批流程

项目建立了一套严格的审批制度：涉及数据库结构、用户数据、授权平台数据、外部 API、推荐权重、LLM 解析或来源采集行为的任务，必须先审批。任务状态流转 `待审批 → 已批准 → 进行中 → 已完成`，每次变更记录审批人、日期、结论、完成情况。这保证了推荐系统这类"调一点权重就有连锁反应"的工程，变更可追溯、可回滚。

### D. 文档索引

- `docs/prd.md` — 产品需求文档
- `docs/design.md` — 技术架构设计
- `docs/api.md` — API 契约文档
- `docs/mcp-server.md` — MCP 使用与部署文档
- `docs/recommendation-system-plan.md` — 推荐算法实现调研
- `docs/tasks.md` / `docs/tasks-2.md` — 任务规划与审批记录
- `docs/supabase-setup.md` — 数据库配置指南
- `docs/other-cities-config.md` — 多城市扩展指南
- `docs/web-structure-proposal.md` — 网页结构方案

---

*CitySense —— 让 AI 重新唤醒城市的真实脉搏。*

*本项目为演示性质，仅供学习和交流使用。*
