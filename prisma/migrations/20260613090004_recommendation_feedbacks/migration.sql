CREATE TABLE "recommendation_feedbacks" (
  "id" TEXT NOT NULL,
  "recommendation_log_id" TEXT NOT NULL,
  "route_id" TEXT NOT NULL,
  "user_id" TEXT,
  "session_id" TEXT,
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recommendation_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_feedbacks_recommendation_log_id_idx" ON "recommendation_feedbacks"("recommendation_log_id");
CREATE INDEX "recommendation_feedbacks_route_id_idx" ON "recommendation_feedbacks"("route_id");
CREATE INDEX "recommendation_feedbacks_user_id_idx" ON "recommendation_feedbacks"("user_id");
CREATE INDEX "recommendation_feedbacks_session_id_idx" ON "recommendation_feedbacks"("session_id");
CREATE INDEX "recommendation_feedbacks_value_idx" ON "recommendation_feedbacks"("value");
CREATE INDEX "recommendation_feedbacks_created_at_idx" ON "recommendation_feedbacks"("created_at");
