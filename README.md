# CitySense

CitySense 是一个基于城市实时信号的 AI 推荐系统，通过采集小红书、大麦、微博、豆瓣等平台的社交热度，结合高德实时 ETA，为用户生成可执行的城市探索路线。

## 核心特性

- **多源城市信号采集**：支持小红书、大麦、微博、豆瓣、高德 POI、上海政府公开活动等数据源
- **LLM 归一化与解释**：自动解析多源数据，生成可追溯的推荐理由
- **实时交通感知**：基于高德 API 的 ETA 排序与路径规划
- **用户画像驱动**：基于站内反馈的个性化推荐（冷启动友好）
- **MCP Server 支持**：可作为 MCP Server 供 Claude/Cursor 等 Agent 调用
- **可视化工作台**：地图优先的路线可达性工作台 UI

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要环境变量：

```bash
# 数据库（必需）
DATABASE_URL=”postgresql://...”

# Demo 模式（必需，设为 true 才能看到演示数据）
CITYSENSE_DEMO_MODE=”true”

# 可选：高德地图服务
AMAP_API_KEY=”your-amap-web-service-key”
NEXT_PUBLIC_AMAP_JS_API_KEY=”your-amap-js-api-web-key”
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=”your-amap-js-api-security-code”

# 可选：LLM 服务（推荐解释与数据归一化）
OPENAI_API_KEY=””
OPENAI_MODEL=”gpt-5.5”
```

### 初始化数据库

```bash
pnpm prisma:generate
pnpm db:seed
```

> `pnpm db:seed` 会幂等写入 20+ 条上海活动和地点，覆盖徐汇、静安、长宁、黄浦、浦东。

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 即可看到推荐工作台。

## MCP 使用

CitySense 暴露为 MCP Server，可被 Claude Desktop、Cursor 等工具调用。

### 本地使用（stdio 模式）

```bash
pnpm mcp:server
```

配置 `~/.claude_desktop_config.json`：

```json
{
  “mcpServers”: {
    “citysense”: {
      “command”: “node”,
      “args”: [“--env-file=.env”, “--import”, “tsx”, “server/mcp/server.ts”],
      “cwd”: “D:/citysense/citysense/CitySense”
    }
  }
}
```

### 远程部署（HTTP 模式）

```bash
# 1. 配置 .env
MCP_API_TOKEN=”your-token-here”
MCP_HOST=”0.0.0.0”
MCP_PORT=”18070”

# 2. 启动 HTTP Server
pnpm mcp:http

# 3. 或使用 Docker
docker compose -f docker-compose.citysense-mcp.yml up -d
```

详细配置请查看 [MCP Server 文档](docs/mcp-server.md)。

### 可用工具

| 工具 | 说明 |
|------|------|
| `recommend_routes` | 生成 3 条可执行城市路线 |
| `get_route_detail` | 获取路线详情与地图视图 |
| `get_city_pulse` | 城市脉搏聚合数据 |
| `get_ingest_status` | 数据源采集状态 |
| `resolve_traffic` | 两点间 ETA/距离/拥堵 |
| `record_feedback` | 路线级反馈记录 |
| `list_sources` | 列出所有数据源 |

## 环境变量详解

### 数据库

```bash
DATABASE_URL=”postgresql://...”
DATABASE_CONNECTION_LIMIT=”1”
DATABASE_POOL_TIMEOUT=”20”
CITYSENSE_DEMO_MODE=”false”
```

- `DATABASE_URL`：PostgreSQL 连接串（必需）
- `DATABASE_CONNECTION_LIMIT`：连接池限制（默认 1）
- `DATABASE_POOL_TIMEOUT`：连接池超时（秒，默认 20）
- `CITYSENSE_DEMO_MODE`：Demo 模式（`true` 时显示演示数据）

### LLM 推荐解释层（可选增强）

缺少 `OPENAI_API_KEY`、调用超时或模型返回不合规时，推荐接口会继续使用本地模板解释：

```bash
OPENAI_API_KEY=””
OPENAI_MODEL=”gpt-5.5”
OPENAI_TIMEOUT_MS=”8000”
OPENAI_BASE_URL=”https://api.openai.com/v1”
OPENAI_API_BASE=””
API_BASE=””
CITYSENSE_LLM_NORMALIZE_ENABLED=”true”
CITYSENSE_LLM_NORMALIZE_SOURCES=”all”
CITYSENSE_LLM_NORMALIZE_TIMEOUT_MS=”15000”
```

### Source Adapter 入库流水线

```bash
REDIS_URL=”redis://localhost:6379”
```

配置 `REDIS_URL` 后，可使用后台 Worker 进行数据采集：

```bash
# 启动 ingest worker
pnpm worker:ingest

# 启动 normalize worker（处理 LLM 归一化）
pnpm worker:normalize
```

### 小红书 MCP 服务

```bash
XIAOHONGSHU_MCP_URL=”http://localhost:18060/mcp”
XIAOHONGSHU_MCP_TOKEN=””
XIAOHONGSHU_MCP_SEARCH_TOOL=”ai_search_chat”
XIAOHONGSHU_MCP_AI_SEARCH_INCLUDE_SOURCES=”true”
XIAOHONGSHU_MCP_AI_SEARCH_SOURCE_LIMIT=”20”
XIAOHONGSHU_MCP_AI_SEARCH_TIMEOUT_SECONDS=”90”
```

首次使用需要完成小红书登录，可在 `/admin/sources` 生成二维码并检查登录状态。

### B 站 MCP 服务

```bash
BILIBILI_MCP_URL=”https://your-bilibili-mcp.example.com/mcp”
BILIBILI_MCP_TOKEN=””
```

### Trends Hub（微博/知乎/头条/澎湃热榜）

```bash
TRENDS_HUB_MCP_COMMAND=”npx”
TRENDS_HUB_MCP_ARGS=”-y mcp-trends-hub”
TRENDS_HUB_MCP_TOOLS=”get_weibo_trending,get_zhihu_trending,get_toutiao_trending,get_thepaper_trending”
TRENDS_HUB_HIDDEN_FIELDS=”cover”
TRENDS_HUB_MAX_ITEMS=”30”
```

- `TRENDS_HUB_HIDDEN_FIELDS`：要隐藏的字段（逗号分隔，默认 cover）
- `TRENDS_HUB_MAX_ITEMS`：最大采集项目数（默认 30）

### 大麦采集

```bash
# 浏览器验证后保存的 cookie（可选）
DAMAI_COOKIE_HEADER=””
```

### 上海政府公开活动源

```bash
SHANGHAI_GOV_EVENTS_URL=”https://www.shanghai.gov.cn/nw31406/index.html”
SHANGHAI_GOV_MAX_DETAILS=”8”
```

### 实时 ETA 排序

```bash
AMAP_API_KEY=”your-amap-web-service-key”
```

`AMAP_API_KEY` 必须是高德开放平台的 Web 服务 API key。配置后，推荐接口只会对粗排后的 Top 10 候选调用高德 ETA。

### 路线详情页地图

```bash
NEXT_PUBLIC_AMAP_JS_API_KEY=”your-amap-js-api-web-key”
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=”your-amap-js-api-security-code”
```

用于高德地图 JS API 2.0。未配置时，路线详情页会显示静态路线预览。

## 核心接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/recommend` | POST | 返回 3 条可执行城市路线 |
| `/api/routes/:id` | GET | 返回路线详情、地图 polyline 和站点 markers |
| `/api/feedback` | POST | 记录轻量反馈事件（up/down/save/dismiss） |
| `/api/ingest/run` | POST | 创建 Source Adapter 采集任务并入队 |
| `/api/ingest/status` | GET | 返回队列、连接器和采集任务状态 |
| `/api/city-pulse` | GET | 返回城市脉搏面板所需聚合信号 |
| `/api/admin/xhs-login/qrcode` | POST | 生成小红书 MCP 登录二维码 |
| `/api/admin/xhs-login/status` | GET | 检查小红书 MCP 登录状态 |
| `/api/admin/xhs-login/verification-code` | POST | 提交小红书扫码后的验证码 |
| `/api/admin/damai-session/start` | POST | 启动大麦验证会话 |
| `/api/admin/damai-session/status` | GET | 检查大麦会话状态 |
| `/api/admin/damai-session/save` | POST | 保存大麦 cookie |
| `/api/amap/route` | POST | 获取或估算路线 ETA |
| `/api/user-profile` | GET/DELETE | 获取或清空用户画像 |
| `/api/city-profile` | GET | 获取城市画像 |

详细 API 规范请查看 [API 文档](docs/api.md)。

## 架构原则

实时推荐链路不直接爬取外部平台，也不实时调用 MCP 服务。Source Adapter 和 worker 负责提前沉淀城市信号；推荐 API 读取规范化候选数据，并且只对短名单调用交通接口。

```
┌─────────────────────────────────────────────────────────────┐
│                        推荐链路                               │
├─────────────────────────────────────────────────────────────┤
│  用户输入 → 召回候选 → 特征计算 → 排序 → 交通重排 → 路线组装 │
│                  ↑                 ↑                         │
│              数据库读取        高德 ETA（Top-N）              │
│                  ↑                                          │
│         Source Adapter + Worker（后台）                      │
└─────────────────────────────────────────────────────────────┘
```

排序权重经过 TASK2-P0-001（画像层）与 TASK2-P0-004（归一化）两次审批调整，当前正权重之和 = 1.00（`calculateFinalScore` 为真正的加权平均），详见 [推荐系统规划](docs/recommendation-system-plan.md) 与 [任务文档](docs/tasks-2.md)。

## 项目结构

```
CitySense/
├── app/                    # Next.js App Router（前端页面 + API 路由）
├── components/             # React 组件
├── server/                 # 后端核心逻辑
│   ├── recommendation/     # 推荐系统核心
│   ├── sources/            # 数据源适配器
│   ├── ingest/             # 数据采集流水线
│   ├── maps/               # 地图服务
│   └── mcp/                # MCP Server 工具
├── workers/                # 后台 Worker
├── prisma/                 # 数据库模型
├── tests/                  # 测试文件
└── docs/                   # 项目文档
```

## 文档

- [PRD](docs/prd.md) - 产品需求文档
- [技术设计](docs/design.md) - 技术架构设计
- [API 规范](docs/api.md) - API 契约文档
- [MCP Server](docs/mcp-server.md) - MCP 使用与部署文档
- [推荐系统规划](docs/recommendation-system-plan.md) - 推荐算法实现调研
- [任务列表](docs/tasks.md) - 黑客松任务规划
- [任务列表（二阶段）](docs/tasks-2.md) - 真实 MVP 补齐规划
- [Supabase 配置](docs/supabase-setup.md) - 数据库配置指南

## 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 生成 Prisma Client
pnpm prisma:generate

# 执行数据库迁移
pnpm prisma:migrate

# 执行数据库 Seed
pnpm db:seed

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 构建生产版本
pnpm build

# 启动 MCP Server（stdio 模式）
pnpm mcp:server

# 启动 MCP Server（HTTP 模式）
pnpm mcp:http

# 启动 Ingest Worker
pnpm worker:ingest

# 启动 Normalize Worker
pnpm worker:normalize
```

## 常见问题

### Q: 为什么推荐结果为空？

A: 确保已设置 `CITYSENSE_DEMO_MODE=”true”` 并运行了 `pnpm db:seed`。或者在 `/admin/sources` 触发一次数据采集。

### Q: 如何接入真实数据源？

A: 在 `/admin/sources` 页面配置相应的 MCP 服务 URL 和 Token，或填写平台 API Key，然后点击”触发采集”。

### Q: LLM 解释层是必需的吗？

A: 不是。缺少 `OPENAI_API_KEY` 时，推荐接口会回退到本地模板解释，不影响核心功能。

### Q: 如何部署生产环境？

A: 参考 [任务列表](docs/tasks.md) 中的 `TASK-P2-003：部署与运维` 章节。

## 许可证

本项目为演示性质，仅供学习和交流使用。
