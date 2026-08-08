# 用户分享小众地点

## 功能

- Supabase Auth 邮箱 Magic Link 登录。
- `/submit-place` 创建地点投稿，支持高德搜索或全新地点。
- 本地图片直接上传到私有 Supabase Storage，服务端使用 sharp 校验、去 EXIF 并转 WebP。
- 系统检查地址、坐标和重复地点后，可自动关联现有 Venue 或发布新 Venue。
- `/my-submissions` 查看处理状态。
- `/admin/submissions` 后审自动发布内容、通过/拒绝待审投稿、下架地点。

## Supabase 配置

1. 开启 Email Magic Link，并将 `/auth/callback` 的本地和生产 URL 加入 redirect allowlist。
2. 创建私有 bucket `submission-originals`。
3. 创建公开 bucket `venue-images`。
4. 设置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和仅服务端使用的 `SUPABASE_SERVICE_ROLE_KEY`。如果 web 容器访问 Supabase 的地址与浏览器不同，另设 `SUPABASE_URL`；它必须与 public URL 指向同一 Supabase 项目。
5. `CITYSENSE_ADMIN_EMAILS` 只用于首次 AppUser 管理员 bootstrap。

## 自动发布

生产默认关闭。需要显式设置：

```env
CITYSENSE_UGC_ENABLED="true"
CITYSENSE_UGC_AUTO_PUBLISH_ENABLED="true"
CITYSENSE_UGC_NOVEL_AUTO_PUBLISH_ENABLED="true"
```

高德未收录的新地点只要拥有有效图片、地址和坐标并且没有明确重复，也可以自动发布。

## 内容治理说明

当前按产品决策不执行图片或文本内容审核。系统只校验图片格式、大小、像素和可解码性，并清除 EXIF/GPS。管理员需要在 `/admin/submissions` 后审自动发布内容，并可删除图片或下架地点。

生产遇到“图片上传准备失败（HTTP 500）”时，先从实际 web 容器确认 `SUPABASE_URL`（或回退的 `NEXT_PUBLIC_SUPABASE_URL`）、`SUPABASE_SERVICE_ROLE_KEY` 和 bucket 名已设置；再使用同一 service-role 凭据确认私有 `submission-originals` bucket 存在且可创建 signed upload URL。修改任何 `NEXT_PUBLIC_*` 变量后必须重新构建 web 镜像，因为它们会在构建时嵌入浏览器 bundle。上传接口日志包含 request ID、失败阶段和上游错误状态，但不会记录密钥或签名 token。

## Worker

配置 Redis 后运行：

```bash
pnpm worker:submissions
```

未配置 Redis 时，提交 API 会在当前请求后同步执行自动处理，适合本地开发，不建议生产使用。
