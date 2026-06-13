# Supabase 配置指南：TASK-P0-001

本文档用于指导 CitySense 接入 Supabase Postgres。当前项目使用 Prisma 6.x，因此先使用 `DATABASE_URL` 连接 Supabase 数据库并执行 Prisma migration。

## 当前决策

- 数据库：Supabase Postgres
- ORM：Prisma 6.19.x
- 推荐连接方式：Supavisor Session pooler，端口 `5432`
- 失败策略：数据库未配置或不可用时，推荐接口直接报错，不回退 mock 数据

## 1. 创建 Supabase 项目

在 Supabase 控制台创建新项目：

- Project name：`citysense` 或 `soloverser`
- Region：优先选择离部署环境近的区域
- Database password：使用密码管理器生成强密码

注意：

- 不要把数据库密码、service role key 或完整连接串发到聊天里。
- 当前任务只需要数据库连接串，不需要 Supabase `service_role` key。

## 2. 创建 Prisma 数据库用户

打开 Supabase 项目的 SQL Editor，执行下面 SQL。

请把 `custom_password` 换成你自己生成的强密码：

```sql
create user "prisma" with password 'custom_password' bypassrls createdb;

grant "prisma" to "postgres";

grant usage on schema public to prisma;
grant create on schema public to prisma;
grant all on all tables in schema public to prisma;
grant all on all routines in schema public to prisma;
grant all on all sequences in schema public to prisma;

alter default privileges for role postgres in schema public grant all on tables to prisma;
alter default privileges for role postgres in schema public grant all on routines to prisma;
alter default privileges for role postgres in schema public grant all on sequences to prisma;
```

这一步的目的：

- 避免直接把 `postgres` 主用户用于应用连接。
- 让 Prisma 可以创建表、执行迁移，并方便在 Supabase 中观察 Prisma 连接。

## 3. 获取数据库连接串

在 Supabase Dashboard：

1. 打开项目。
2. 点击顶部或侧边栏的 `Connect`。
3. 选择数据库连接信息。
4. 找到 `Supavisor Session pooler`。
5. 复制以端口 `5432` 结尾的连接串。

连接串格式大致如下：

```txt
postgres://postgres.[PROJECT_REF]:[DB_PASSWORD]@[DB_REGION].pooler.supabase.com:5432/postgres
```

把用户名改成 `prisma.[PROJECT_REF]`，密码改成第 2 步创建的 Prisma 用户密码：

```txt
postgres://prisma.[PROJECT_REF]:[PRISMA_PASSWORD]@[DB_REGION].pooler.supabase.com:5432/postgres
```

## 4. 配置本地 `.env`

在项目根目录执行：

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
DATABASE_URL="postgres://prisma.[PROJECT_REF]:[PRISMA_PASSWORD]@[DB_REGION].pooler.supabase.com:5432/postgres"
AMAP_API_KEY=""
OPENAI_API_KEY=""
```

注意：

- `.env` 已被 `.gitignore` 忽略，不会提交。
- `.env.example` 只保留模板，不要写真实密钥。

## 5. 等待 Codex 执行迁移和验证

完成 `.env` 后告诉 Codex：“Supabase 配置好了”。

随后由 Codex 执行：

```bash
pnpm prisma migrate dev --name init_citysense
pnpm prisma generate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm build
```

验收目标：

- Supabase 中出现 CitySense 所需表。
- `POST /api/recommend` 可以基于持久化数据返回路线。
- 数据库不可用时 API 直接报错，不返回 mock 推荐。

## 重要安全提醒

- 不要在前端暴露数据库连接串。
- 不要把 `service_role` key 放进 `NEXT_PUBLIC_` 环境变量。
- 如果后续通过 Supabase Data API 或 `supabase-js` 从浏览器访问表，需要单独设计 RLS policy。
- 2026 年 Supabase 新项目可能不会自动把新表暴露给 Data API；本任务暂时使用 Prisma 直连数据库，不依赖 Data API。

## 官方参考

- Supabase Prisma 文档：https://supabase.com/docs/guides/database/prisma
- Supabase 数据库连接文档：https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Data API 暴露变更：https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
