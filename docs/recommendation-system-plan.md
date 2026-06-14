# 推荐系统实现调研与规划

日期：2026-06-13

## 结论

短期不建议引入完整机器学习推荐框架作为实时主链路。当前数据量、反馈量和黑客松节奏都不支持直接上复杂模型。

建议采用分阶段方案：

1. P1：基于 Postgres/Supabase 做多路召回、特征快照、可配置规则排序和反馈闭环。
2. P1+：引入 `pg_trgm`、Postgres full-text search、可选 `pgvector` 做混合召回。
3. P2：当反馈数据足够后，再考虑 Python 侧车服务，用 XGBoost/LightGBM 做 learning-to-rank，或用 `implicit` 做协同过滤。
4. P2+：路线组合复杂后，再考虑 OR-Tools；当前 2-3 个地点的路线不需要约束求解器。

## 当前实现状态

现有推荐链路：

```txt
POST /api/recommend
  -> retrieveDatabaseCandidates(input)
  -> scoreCandidate(candidate, input)
  -> Top 10
  -> enrichAndRerankByTraffic(...)
  -> buildRoutes(...)
  -> explainRoutes(...)
  -> persistRecommendationSnapshot(...)
```

当前已经完成：

- Supabase 数据库接入。
- 数据库候选召回。
- 高德 ETA 交通重排。
- 推荐快照写入 `recommendation_logs`。
- 路线详情页。
- Source Adapter 入库流水线。

当前主要缺口：

- `/api/feedback` 尚未真正写库。
- 没有显式反馈事件表。
- 没有用户画像更新逻辑。
- 候选召回仍是简单 city/area + tag/text includes。
- 排序权重写死在 `server/recommendation/scoring.ts`。
- 没有推荐评估集、离线指标和 A/B 配置。
- 路线组合仍是固定切片，不是基于路线整体目标函数。

## 技术选型调研

### 1. Postgres full-text search

适用范围：

- 基于标题、描述、标签、区域的关键词召回。
- 支持用户输入自然语言兴趣时的文本相关性排序。
- 可以继续留在 Supabase/Postgres 内，不增加新服务。

相关能力：

- PostgreSQL 支持 `websearch_to_tsquery`，适合把用户搜索式输入转换成查询。
- PostgreSQL 提供 `ts_rank` 和 `ts_rank_cd`，可以对全文检索结果做相关性排名。

采用建议：

- P1 使用。
- 给 `events` 和 `venues` 增加可查询文本字段或 generated `tsvector`。
- 使用 `simple` 配置优先，避免中文分词能力被误判；中文标签命中仍主要依赖 tag 数组和 trigram。

参考：

- PostgreSQL full-text search 控制与排序：https://www.postgresql.org/docs/current/textsearch-controls.html

### 2. pg_trgm

适用范围：

- 地点名、活动名、区域名的模糊匹配。
- 处理输入错别字、简称、大小写和部分字符串匹配。

相关能力：

- `pg_trgm` 提供 trigram 相似度函数、相似度操作符，以及 GIN/GiST 索引支持。

采用建议：

- P1 使用。
- 对 `events.title`、`venues.name`、`address` 建 trigram 索引。
- 不把它当中文语义召回，只用于名称/地址模糊匹配。

参考：

- PostgreSQL pg_trgm 官方文档：https://www.postgresql.org/docs/current/pgtrgm.html
- Supabase 扩展说明：https://supabase.com/docs/guides/database/extensions

### 3. pgvector / Supabase Vector

适用范围：

- 语义召回：例如“适合一个人发呆的地方”命中“安静书店/小型展览/夜间咖啡”。
- 用户画像向量：根据历史喜欢的地点/标签聚合用户偏好。
- item 相似推荐：根据当前地点找到相似活动或地点。

相关能力：

- pgvector 在 Postgres 内支持向量存储、相似度查询、HNSW 和 IVFFlat 索引。
- Supabase 支持 Postgres 扩展，包括 pgvector。

采用建议：

- P1+ 可选。
- 先建 `item_embeddings` 表，不直接改 `Event`/`Venue` 主表。
- embedding 生成放到 ingest/normalize worker，避免推荐接口实时生成。
- query embedding 可以在推荐请求时生成，但必须有超时和缓存。

风险：

- Prisma 对 pgvector 类型支持有限，迁移和查询大概率需要 raw SQL。
- embedding 费用、速率限制和隐私边界需要审批。
- 语义召回不能替代规则排序，只作为 recall channel。

参考：

- pgvector GitHub：https://github.com/pgvector/pgvector
- Supabase AI & Vectors：https://supabase.com/docs/guides/ai

### 4. OpenAI embeddings

适用范围：

- 为活动、地点、用户查询、用户画像生成语义向量。
- 与 pgvector/Supabase Vector 配合做语义召回。

采用建议：

- P1+ 可选，需审批。
- 默认优先考虑 `text-embedding-3-small`，成本和维度更适合当前阶段。
- 对 item embedding 做离线生成；对 query embedding 做短 TTL 缓存。
- 不把用户精确位置、敏感个人信息发送到 embedding API。

参考：

- OpenAI embeddings 文档：https://developers.openai.com/api/docs/guides/embeddings

### 5. XGBoost / LightGBM learning-to-rank

适用范围：

- 有足够反馈数据后，用点击、收藏、喜欢、不感兴趣等行为训练 reranker。
- 排序目标可以是 NDCG、MAP 或点击转化。

采用建议：

- P2 再考虑。
- 不建议直接塞进 Next.js 进程。
- 如果采用，设计为 Python 离线训练 + 导出模型 + 轻量推理服务。
- 在上线前必须先有 feature logging 和离线评估集。

参考：

- XGBoost learning to rank：https://xgboost.readthedocs.io/en/stable/tutorials/learning_to_rank.html

### 6. implicit

适用范围：

- 基于隐式反馈的协同过滤：点击、喜欢、保存、完成路线、负反馈。
- 用户量和交互量增长后，生成“相似用户喜欢的地点/活动”召回通道。

采用建议：

- P2 再考虑。
- 当前冷启动严重，不适合作为主推荐源。
- 可作为离线 batch recall，结果写回 `user_candidate_recommendations` 或类似缓存表。

参考：

- implicit GitHub：https://github.com/benfred/implicit

### 7. RecBole / TensorFlow Recommenders

适用范围：

- 算法研究、离线实验、模型对比。
- 当数据集变大、推荐问题从 demo 变成长期产品时再评估。

采用建议：

- 当前不进入主工程。
- 可作为 P2+ 的实验环境，不作为黑客松工程依赖。

参考：

- RecBole：https://github.com/RUCAIBox/RecBole
- TensorFlow Recommenders：https://www.tensorflow.org/recommenders

### 8. OR-Tools

适用范围：

- 路线组合变成约束优化问题后使用。
- 例如：多个点、开放时间窗口、最大通勤时间、预算、必须/可选停留点。

采用建议：

- 当前不使用。
- 目前每条路线 2-3 个点，用穷举排列 + 交通矩阵即可。
- P2 如果路线点数增加到 5 个以上，再考虑 OR-Tools。

参考：

- Google OR-Tools VRP：https://developers.google.com/optimization/routing/vrp

## 推荐系统目标架构

```txt
Recommendation API
  -> Request Context
  -> Multi-channel Recall
      -> hard filters: city / area / time window
      -> tag recall
      -> text recall: FTS / pg_trgm
      -> social signal recall
      -> semantic recall: pgvector optional
      -> feedback suppressions
  -> Candidate Feature Builder
      -> taste features
      -> freshness features
      -> trend features
      -> geo features
      -> traffic features
      -> user feedback features
      -> diversity features
  -> Ranker
      -> deterministic weighted ranker first
      -> learned reranker later
  -> Traffic Enrichment
      -> only Top-N
      -> cache traffic snapshots
  -> Route Assembler
      -> route-level score
      -> diversity and continuity constraints
  -> Explanation
      -> facts only
  -> Logging
      -> recommendation log
      -> feature snapshot
      -> feedback events
```

## 推荐接口内部抽象

建议新增以下接口，先不改变外部 API：

```ts
export interface CandidateRecallStrategy {
  name: string
  recall(input: RecommendInput): Promise<RecallResult[]>
}

export type CandidateFeatures = {
  candidateId: string
  taste: number
  textRelevance: number
  semanticRelevance?: number
  socialTrend: number
  freshness: number
  distance: number
  traffic?: number
  timeFit: number
  novelty: number
  userAffinity: number
  feedbackPenalty: number
}

export interface CandidateRanker {
  name: string
  rank(input: {
    request: RecommendInput
    candidates: Candidate[]
    features: CandidateFeatures[]
  }): Promise<ScoredCandidate[]>
}

export interface RouteAssembler {
  build(input: {
    request: RecommendInput
    candidates: TrafficCandidate[]
  }): Promise<RecommendedRoute[]>
}
```

设计要求：

- `scoreCandidate` 变成默认 ranker，而不是全局唯一算法。
- 每次推荐记录 ranker name、weights version、recall channels。
- 推荐结果解释必须来自 feature snapshot，不让 LLM 编造。

## 数据模型规划

### 1. UserInteraction

用于替代当前 `/api/feedback` 只 echo 的行为。

```prisma
model UserInteraction {
  id               String   @id @default(cuid())
  userId           String?
  recommendationId String?
  routeId          String?
  itemId           String?
  itemType         String?
  action           String   // view | click | like | dislike | save | complete | dismiss
  weight           Float    @default(1)
  context          Json?
  createdAt        DateTime @default(now())

  @@index([userId])
  @@index([recommendationId])
  @@index([itemId])
  @@index([action])
  @@index([createdAt])
}
```

### 2. RecommendationFeatureSnapshot

用于离线评估、调权和未来 learning-to-rank。

```prisma
model RecommendationFeatureSnapshot {
  id               String   @id @default(cuid())
  recommendationId String
  candidateId      String
  candidateType    String
  ranker           String
  rankerVersion    String
  recallChannels   String[]
  features         Json
  score            Float
  position         Int
  createdAt        DateTime @default(now())

  @@index([recommendationId])
  @@index([candidateId])
  @@index([ranker])
}
```

### 3. ItemEmbedding

只在启用 pgvector 后增加。Prisma schema 可用 raw SQL migration 管理 `vector` 类型。

```sql
create table item_embeddings (
  id text primary key,
  item_id text not null,
  item_type text not null,
  model text not null,
  dimensions int not null,
  content_hash text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 排序策略 V1

保留当前线性打分，但做三项工程化改造：

1. 权重配置化。
2. 特征生成独立化。
3. 每次推荐保存 feature snapshot。

建议初始特征：

| 特征 | 来源 | 说明 |
| --- | --- | --- |
| `taste` | interests + mood + budget | 兴趣和心情匹配 |
| `textRelevance` | FTS / pg_trgm | 标题、描述、标签文本相关性 |
| `socialTrend` | trendScore / city_signals | 平台热度 |
| `freshness` | startTime / createdAt / publishedAt | 新鲜度 |
| `distance` | origin + coordinates | 直线距离 |
| `traffic` | AMap/cache/estimate | 真实可达性 |
| `timeFit` | timeWindow + event time | 时间窗口匹配 |
| `novelty` | popularity + history | 小众度/新鲜感 |
| `actionability` | quality + address/coords | 可执行性质量门（TASK2-P0-001 新增） |
| `userAffinity` | user profile | 用户画像匹配（含 tag/source/area 维度） |
| `feedbackPenalty` | interactions | 不感兴趣、跳过、重复推荐惩罚 |
| `exposurePenalty` | recent exposure | 最近已曝光项轻惩罚（TASK2-P0-001 新增） |

初始分数：

```txt
score =
  taste * 0.22 +
  textRelevance * 0.10 +
  socialTrend * 0.14 +
  freshness * 0.10 +
  distance * 0.10 +
  traffic * 0.14 +
  timeFit * 0.08 +
  novelty * 0.06 +
  userAffinity * 0.08 -
  feedbackPenalty * 0.12
```

> **权重演进说明（TASK2-P0-004，2026-06-15）**
>
> 上述为本文档最初的目标公式。实际实现经历了两次审批调整：
>
> - **TASK2-P0-001（2026-06-14）**：引入画像层。新增 `actionability`（0.20）质量门、
>   `exposurePenalty`（-0.05）曝光惩罚；`userAffinity` 提升至 0.35。此时正权重之和 = 1.34，
>   导致高分候选饱和在 100、分数区分度被压缩。
> - **TASK2-P0-004（2026-06-15）**：权重归一化。正权重之和收敛到 1.00，使
>   `calculateFinalScore` 成为真正的加权平均（all-100→100, all-50→50, all-0→0）。
>   `userAffinity` 从 0.35 降回 0.18（仍是最强正向维度之一，但不再垄断排序）。
>   详见下表与 `docs/tasks-2.md`。
>
> 当前生效权重（`server/recommendation/scoring.ts`）：

```txt
score =
  taste * 0.16 +
  textRelevance * 0.07 +
  socialTrend * 0.08 +
  freshness * 0.06 +
  distance * 0.10 +
  traffic * 0.09 +
  timeFit * 0.05 +
  novelty * 0.03 +
  actionability * 0.18 +
  userAffinity * 0.18 -
  feedbackPenalty * 0.10 -
  exposurePenalty * 0.05
```

（正权重求和 = 1.00，校验见 `tests/recommendation-weights.test.ts`）

注意：

- 这是候选排序分，不是路线最终分。
- route score 应该加入路线连贯性、站点多样性和总交通成本。
- 权重变化必须走审批流程：记录在 `docs/tasks.md`（P0/P1 批次）或 `docs/tasks-2.md`（TASK2 批次）。
  TASK2-P0-001（画像层权重）与 TASK2-P0-004（归一化）的审批结论见 `docs/tasks-2.md`。

## 路线组合 V1

当前 `routeSlices` 是固定切片，容易产生重复和不连贯路线。

建议替换为小规模穷举：

1. 从 Top 10 候选中生成 2 点或 3 点路线组合。
2. 过滤掉缺坐标、跨区过远、标签完全重复的组合。
3. 对每个组合计算 route score：

```txt
routeScore =
  avg(candidateScore) * 0.55 +
  routeContinuity * 0.18 +
  routeDiversity * 0.12 +
  trafficEfficiency * 0.10 +
  timeWindowFit * 0.05
```

4. 选出 3 条路线，要求首站和核心标签尽量不同。

短期不需要 OR-Tools。若路线超过 5 个点并加入开放时间窗口，再评估 OR-Tools。

## 反馈闭环 V1

优先做显式反馈，不要先做复杂协同过滤。

行为权重建议：

| action | weight | 用途 |
| --- | ---: | --- |
| `view` | 0.2 | 曝光记录 |
| `click` | 0.8 | 感兴趣信号 |
| `save` | 1.5 | 强正反馈 |
| `complete` | 2.0 | 最强正反馈 |
| `dismiss` | -0.8 | 弱负反馈 |
| `dislike` | -1.5 | 强负反馈 |

画像更新：

- 正反馈增加对应 tags、area、source、priceLevel、quietness 偏好。
- 负反馈降低对应 tags/source/area 的近期权重。
- 所有反馈加入时间衰减，避免永久锁死推荐。

## 评估方案

必须先有评估，再谈调权或模型替换。

### 单元测试

- `scoreCandidate` 对不同 mood/budget/timeWindow 的排序变化。
- `feedbackPenalty` 对 dislike/dismiss 的影响。
- `routeAssembler` 不返回重复地点。
- AMap 失败时仍能产生推荐。

### 离线评估

构造 `tests/fixtures/recommendation-cases.json`：

- 安静独处。
- 热闹夜生活。
- 低预算。
- 约会。
- 周末展览。
- 无坐标候选。
- 交通很差但兴趣高的候选。

指标：

- `Recall@10`：目标候选是否进入 Top 10。
- `NDCG@3`：人工标注好路线是否排在前 3。
- `Diversity@3`：3 条路线是否避免同质化。
- `TrafficPenalty`：交通差的路线是否被合理降权。

### 线上观测

- 推荐接口耗时。
- 候选池大小。
- Top-N 高德调用次数。
- 缓存命中率。
- feedback action 分布。
- 同一用户重复推荐率。

## 实施阶段

### 阶段 A：工程底座

- 新增 `UserInteraction`。
- `/api/feedback` 写库。
- 新增 feature builder。
- 新增 ranker 接口。
- 保存 feature snapshot。
- 保留当前规则分作为 `weighted-v1`。

### 阶段 B：多路召回

- tag recall。
- FTS recall。
- pg_trgm recall。
- city signal recall。
- feedback suppression recall。
- 召回结果记录 channel。

### 阶段 C：路线组合升级

- 替换固定切片。
- 引入 route-level score。
- 引入多样性约束。
- 加测试。

### 阶段 D：语义召回可选

- 启用 pgvector。
- item embedding 离线生成。
- query embedding 缓存。
- semantic recall channel。
- 对比有无 semantic recall 的结果质量。

### 阶段 E：模型化排序可选

- 导出 feature snapshot + interaction label。
- 离线训练 XGBoost/LightGBM ranker。
- 只在离线指标显著优于 `weighted-v1` 后接入。

## 审批边界

以下动作必须先审批：

- 修改推荐权重。
- 新增用户行为表或长期存储用户数据。
- 启用 embedding API。
- 启用 pgvector migration。
- 引入 Python 侧车服务。
- 接入 XGBoost/LightGBM/implicit/RecBole/TFRS。
- 修改路线组合目标函数。

## 推荐下一步

优先推进：

1. `TASK-P0-004`：持久化推荐日志与用户反馈。
2. 新增推荐系统升级任务：多路召回、feature builder、ranker interface、route assembler。
3. 完成最小评估集，再允许调整权重。

不建议马上推进：

- RecBole/TFRS。
- 协同过滤。
- learning-to-rank。
- OR-Tools。

这些都需要更多反馈数据和更明确的评估基线。
