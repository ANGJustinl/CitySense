export const FEEDBACK_REASONS = {
  interest_match: { label: "兴趣很匹配", direction: "positive" },
  atmosphere_match: { label: "氛围很合适", direction: "positive" },
  budget_match: { label: "预算很合适", direction: "positive" },
  area_match: { label: "区域很喜欢", direction: "positive" },
  not_interested: { label: "兴趣不符合", direction: "negative" },
  too_noisy: { label: "环境太吵", direction: "negative" },
  too_expensive: { label: "预算太高", direction: "negative" },
  area_dislike: { label: "不喜欢这个区域", direction: "negative" }
} as const;

export type FeedbackReason = keyof typeof FEEDBACK_REASONS;
export type FeedbackDirection = (typeof FEEDBACK_REASONS)[FeedbackReason]["direction"];

export const feedbackReasonCodes = Object.keys(FEEDBACK_REASONS) as [FeedbackReason, ...FeedbackReason[]];

export function feedbackDirection(value: "up" | "down" | "save" | "dismiss"): FeedbackDirection {
  return value === "up" || value === "save" ? "positive" : "negative";
}

export function isFeedbackReasonAllowed(value: "up" | "down" | "save" | "dismiss", reason: FeedbackReason) {
  return FEEDBACK_REASONS[reason].direction === feedbackDirection(value);
}

export function feedbackReasonsFor(value: "up" | "down" | "save") {
  const direction = feedbackDirection(value);
  return feedbackReasonCodes.filter((reason) => FEEDBACK_REASONS[reason].direction === direction);
}
