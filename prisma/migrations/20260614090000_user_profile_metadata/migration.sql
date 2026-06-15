-- TASK-P2-002 用户品味画像 MVP
-- UserPreference 增加画像快照元数据列,完整画像仍存在 metadata Json 中。
-- 幂等 + 可回滚(列均可空)。
ALTER TABLE "UserPreference"
  ADD COLUMN IF NOT EXISTS "profileVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "signalCount" INTEGER;
