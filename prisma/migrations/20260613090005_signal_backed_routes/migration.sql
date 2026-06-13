ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "qualityFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "qualityFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Event"
SET
  "qualityFlags" = ARRAY_REMOVE(ARRAY[
    CASE
      WHEN "source" IN ('xiaohongshu', 'bilibili', 'trends-hub')
        AND concat_ws(' ', "title", coalesce("description", ''), array_to_string("tags", ' '))
          ~* '(合集|汇总|攻略|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|[0-9]+\\+?个|[0-9]+家)'
      THEN 'generic_social'
    END,
    CASE
      WHEN "address" IS NULL OR btrim("address") = ''
      THEN 'missing_address'
    END,
    CASE
      WHEN "lat" IS NULL OR "lng" IS NULL
      THEN 'missing_coords'
    END
  ]::TEXT[], NULL),
  "qualityScore" = LEAST(100, GREATEST(0,
    50
    + CASE WHEN "address" IS NOT NULL AND btrim("address") <> '' THEN 20 ELSE -20 END
    + CASE WHEN "lat" IS NOT NULL AND "lng" IS NOT NULL THEN 25 ELSE -20 END
    + CASE
        WHEN "source" = 'amap-poi' THEN 10
        WHEN "source" = 'shanghai-gov' THEN 8
        ELSE 0
      END
    + CASE
        WHEN "source" IN ('xiaohongshu', 'bilibili', 'trends-hub')
          AND concat_ws(' ', "title", coalesce("description", ''), array_to_string("tags", ' '))
            ~* '(合集|汇总|攻略|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|[0-9]+\\+?个|[0-9]+家)'
        THEN -45
        ELSE 0
      END
  ));

UPDATE "Venue"
SET
  "qualityFlags" = ARRAY_REMOVE(ARRAY[
    CASE
      WHEN "source" IN ('xiaohongshu', 'bilibili', 'trends-hub')
        AND concat_ws(' ', "name", coalesce("description", ''), array_to_string("tags", ' '))
          ~* '(合集|汇总|攻略|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|[0-9]+\\+?个|[0-9]+家)'
      THEN 'generic_social'
    END,
    CASE
      WHEN "address" IS NULL OR btrim("address") = ''
      THEN 'missing_address'
    END,
    CASE
      WHEN "lat" IS NULL OR "lng" IS NULL
      THEN 'missing_coords'
    END
  ]::TEXT[], NULL),
  "qualityScore" = LEAST(100, GREATEST(0,
    50
    + CASE WHEN "address" IS NOT NULL AND btrim("address") <> '' THEN 20 ELSE -20 END
    + CASE WHEN "lat" IS NOT NULL AND "lng" IS NOT NULL THEN 25 ELSE -20 END
    + CASE
        WHEN "source" = 'amap-poi' THEN 10
        WHEN "source" = 'shanghai-gov' THEN 8
        ELSE 0
      END
    + CASE
        WHEN "source" IN ('xiaohongshu', 'bilibili', 'trends-hub')
          AND concat_ws(' ', "name", coalesce("description", ''), array_to_string("tags", ' '))
            ~* '(合集|汇总|攻略|清单|一览|必逛|必藏|收藏|码住|抄作业|citywalk|[0-9]+\\+?个|[0-9]+家)'
        THEN -45
        ELSE 0
      END
  ));

CREATE INDEX IF NOT EXISTS "Event_qualityScore_idx" ON "Event"("qualityScore");
CREATE INDEX IF NOT EXISTS "Venue_qualityScore_idx" ON "Venue"("qualityScore");
CREATE INDEX IF NOT EXISTS "Event_qualityFlags_idx" ON "Event" USING GIN ("qualityFlags");
CREATE INDEX IF NOT EXISTS "Venue_qualityFlags_idx" ON "Venue" USING GIN ("qualityFlags");
