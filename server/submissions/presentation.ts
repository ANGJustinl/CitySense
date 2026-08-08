import type { SubmissionImageStatus, VenueSubmissionStatus } from "@prisma/client";

export type SubmissionDisplayGroup = "ACTION_REQUIRED" | "IN_PROGRESS" | "COMPLETED";
export type SubmissionTone = "attention" | "progress" | "success" | "negative" | "neutral";

export type SubmissionStatusMeta = {
  label: string;
  description: string;
  group: SubmissionDisplayGroup;
  tone: SubmissionTone;
};

export const SUBMISSION_STATUS_META: Record<VenueSubmissionStatus, SubmissionStatusMeta> = {
  DRAFT: { label: "草稿", description: "尚未完成提交", group: "ACTION_REQUIRED", tone: "attention" },
  CHANGES_REQUESTED: { label: "需要补充", description: "投稿需要补充信息后重新提交", group: "ACTION_REQUIRED", tone: "attention" },
  SUBMITTED: { label: "已提交", description: "正在等待自动处理", group: "IN_PROGRESS", tone: "progress" },
  PROCESSING: { label: "处理中", description: "正在自动处理", group: "IN_PROGRESS", tone: "progress" },
  NEEDS_REVIEW: { label: "处理失败", description: "自动处理未完成，可以重试", group: "IN_PROGRESS", tone: "negative" },
  AUTO_PUBLISHED: { label: "已发布", description: "地点已发布到 CitySense", group: "COMPLETED", tone: "success" },
  APPROVED: { label: "已通过", description: "投稿已发布", group: "COMPLETED", tone: "success" },
  REJECTED: { label: "未通过，可修改", description: "可以修改投稿后再次提交", group: "COMPLETED", tone: "negative" },
  WITHDRAWN: { label: "已撤回", description: "投稿已撤回", group: "COMPLETED", tone: "neutral" },
  REMOVED: { label: "已移除", description: "地点已从列表移除", group: "COMPLETED", tone: "negative" }
};

export function canEditSubmission(status: VenueSubmissionStatus) {
  return ["DRAFT", "CHANGES_REQUESTED", "REJECTED", "AUTO_PUBLISHED", "APPROVED"].includes(status);
}

export function canWithdrawSubmission(status: VenueSubmissionStatus) {
  return ["DRAFT", "CHANGES_REQUESTED", "REJECTED", "SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "AUTO_PUBLISHED", "APPROVED"].includes(status);
}

export function canSubmitSubmission(status: VenueSubmissionStatus) {
  return ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(status);
}

export function canRetrySubmission(status: VenueSubmissionStatus, technicalFlags: string[] = []) {
  return status === "NEEDS_REVIEW" && technicalFlags.length > 0;
}

export const SUBMISSION_DISPLAY_GROUPS: Array<{ key: SubmissionDisplayGroup; label: string; description: string }> = [
  { key: "ACTION_REQUIRED", label: "待我处理", description: "尚未完成或需要补充的投稿" },
  { key: "IN_PROGRESS", label: "处理中", description: "已经收到，正在处理或审核" },
  { key: "COMPLETED", label: "已完成", description: "已经发布或处理结束的投稿" }
];

export function countSubmissionImages(images: Array<{ status: SubmissionImageStatus }>) {
  return images.reduce(
    (counts, image) => {
      if (image.status === "SAFE") counts.valid += 1;
      if (image.status === "FAILED") counts.failed += 1;
      return counts;
    },
    { valid: 0, failed: 0 }
  );
}

export function groupSubmissionsForDisplay<T extends { status: VenueSubmissionStatus }>(submissions: T[]) {
  const groups: Record<SubmissionDisplayGroup, T[]> = {
    ACTION_REQUIRED: [],
    IN_PROGRESS: [],
    COMPLETED: []
  };
  for (const submission of submissions) groups[SUBMISSION_STATUS_META[submission.status].group].push(submission);
  return groups;
}
