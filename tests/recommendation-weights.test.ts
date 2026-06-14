import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFinalScore,
  WEIGHTED_RANKER_WEIGHTS
} from "@/server/recommendation/scoring";
import type { ScoreBreakdown } from "@/server/recommendation/types";

function breakdown(value: number): ScoreBreakdown {
  return {
    taste: value,
    textRelevance: value,
    socialTrend: value,
    freshness: value,
    distance: value,
    traffic: value,
    timeFit: value,
    novelty: value,
    actionability: value,
    userAffinity: value,
    // penalty 默认 0（中性无惩罚场景）；需要测试惩罚时单独覆盖。
    feedbackPenalty: 0,
    exposurePenalty: 0
  };
}

test("正权重之和收敛到 1.00（TASK2-P0-004 归一化）", () => {
  const positiveKeys = [
    "taste",
    "textRelevance",
    "socialTrend",
    "freshness",
    "distance",
    "traffic",
    "timeFit",
    "novelty",
    "actionability",
    "userAffinity"
  ] as const;

  const sum = positiveKeys.reduce((acc, key) => acc + WEIGHTED_RANKER_WEIGHTS[key], 0);
  // 允许浮点误差，目标精确 1.00
  assert.ok(
    Math.abs(sum - 1) < 0.001,
    `正权重之和应为 1.00，实际 ${sum}`
  );
});

test("负权重保持稳定（feedbackPenalty -0.10, exposurePenalty -0.05）", () => {
  assert.equal(WEIGHTED_RANKER_WEIGHTS.feedbackPenalty, -0.1);
  assert.equal(WEIGHTED_RANKER_WEIGHTS.exposurePenalty, -0.05);
});

test("满分候选（无惩罚）→ score = 100", () => {
  // 全部正向维度 = 100，惩罚 = 0
  const full: ScoreBreakdown = {
    taste: 100,
    textRelevance: 100,
    socialTrend: 100,
    freshness: 100,
    distance: 100,
    traffic: 100,
    timeFit: 100,
    novelty: 100,
    actionability: 100,
    userAffinity: 100,
    feedbackPenalty: 0,
    exposurePenalty: 0
  };
  assert.equal(calculateFinalScore(full), 100);
});

test("中性候选（全 50、无惩罚）→ score = 50", () => {
  assert.equal(calculateFinalScore(breakdown(50)), 50);
});

test("零分候选（无惩罚）→ score = 0", () => {
  assert.equal(calculateFinalScore(breakdown(0)), 0);
});

test("惩罚会拉低分数：满分 + feedbackPenalty=50 → 95", () => {
  // feedbackPenalty 权重 -0.10，50 * 0.10 = 5 分扣减
  const withPenalty: ScoreBreakdown = {
    ...breakdown(100),
    feedbackPenalty: 0,
    exposurePenalty: 0
  };
  withPenalty.feedbackPenalty = 50;
  assert.equal(calculateFinalScore(withPenalty), 95);
});

test("权重归一化后排序区分度提升：高 actionability 候选显著高于低 actionability", () => {
  // 归一化前，正权重和=1.34 导致两个候选都饱和在 100 附近，区分度被压缩。
  // 归一化后，actionability 差异应直接反映在分数差上。
  const high: ScoreBreakdown = { ...breakdown(50), actionability: 100, userAffinity: 100 };
  const low: ScoreBreakdown = { ...breakdown(50), actionability: 0, userAffinity: 0 };

  const highScore = calculateFinalScore(high);
  const lowScore = calculateFinalScore(low);

  assert.ok(
    highScore - lowScore >= 30,
    `高/低候选分数差应 >= 30，实际 ${highScore - lowScore}（${highScore} vs ${lowScore}）`
  );
});
