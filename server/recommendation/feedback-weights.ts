/**
 * 站内反馈 action → 维度权重的共享映射（TASK2-P0-004 抽取）。
 *
 * 之前 feedback.ts 和 user-profile-v2.ts 各自硬编码同一张表，仅靠注释维持同步，
 * 存在维护风险。此处作为单一事实源，两处均从此 import。
 *
 * 语义：
 * - up:    轻度正向（用户点了赞）
 * - save:  强正向（用户主动收藏，高意向信号）
 * - down:  强负向（明确不感兴趣）
 * - dismiss: 轻度负向（跳过/忽略）
 */
export const FEEDBACK_INTERACTION_WEIGHT = {
  up: 1,
  save: 1.5,
  down: -1.5,
  dismiss: -0.8
} as const;

export type FeedbackAction = keyof typeof FEEDBACK_INTERACTION_WEIGHT;
