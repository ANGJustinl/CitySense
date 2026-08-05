import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const buddyProfileSchema = z.object({
  displayName: trimmed(30).min(2),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  bio: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(40).nullable().optional()
});

export const buddyPreferenceSchema = z.object({
  version: z.literal(1).default(1),
  hard: z.object({
    pace: z.enum(["relaxed", "balanced", "fast"]).optional(),
    budget: z.enum(["low", "medium", "high"]).optional(),
    smoking: z.enum(["accept", "no-smoking"]).optional(),
    meetingAreas: z.array(trimmed(30)).max(8).default([])
  }).default({ meetingAreas: [] }),
  soft: z.object({
    interests: z.array(trimmed(30)).max(12).default([]),
    quietness: z.enum(["lively", "balanced", "quiet"]).optional(),
    popularity: z.enum(["low", "medium", "high"]).optional(),
    moods: z.array(trimmed(30)).max(8).default([])
  }).default({ interests: [], moods: [] }),
  publicLabels: z.array(trimmed(30)).max(12).default([])
});

export const createBuddyIntentSchema = z.object({
  mode: z.enum(["POST", "AUTO"]),
  routeSnapshotId: trimmed(200),
  departureStart: z.coerce.date(),
  departureEnd: z.coerce.date(),
  timezone: z.string().trim().max(50).default("Asia/Shanghai"),
  meetingLabel: trimmed(100),
  meetingArea: z.string().trim().max(40).optional(),
  publicNote: z.string().trim().max(300).optional(),
  preferences: buddyPreferenceSchema.default({
    version: 1,
    hard: { meetingAreas: [] },
    soft: { interests: [], moods: [] },
    publicLabels: []
  })
}).superRefine((value, context) => {
  if (value.departureEnd <= value.departureStart) {
    context.addIssue({ code: "custom", path: ["departureEnd"], message: "结束时间必须晚于开始时间" });
  }
});

export const applyBuddySchema = z.object({ message: z.string().trim().max(300).optional() });
export const decideBuddyApplicationSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  version: z.number().int().positive()
});
export const versionSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().max(120).optional() });
export const sendBuddyMessageSchema = z.object({ clientMessageId: trimmed(100), body: trimmed(2000) });
export const markBuddyReadSchema = z.object({ readAt: z.coerce.date().optional() });
export const blockBuddySchema = z.object({ blockedUserId: z.string().uuid(), reason: z.string().trim().max(200).optional() });
export const reportBuddySchema = z.object({
  reportedUserId: z.string().uuid().optional(),
  groupId: z.string().trim().optional(),
  messageId: z.string().trim().optional(),
  category: z.enum(["HARASSMENT", "FRAUD", "UNSAFE_BEHAVIOR", "INAPPROPRIATE_CONTENT", "IMPERSONATION", "OTHER"]),
  detail: z.string().trim().max(1000).optional(),
  blockUser: z.boolean().default(false),
  leaveGroup: z.boolean().default(false)
}).refine((value) => value.reportedUserId || value.groupId || value.messageId, {
  message: "至少选择一个举报对象"
});

export type BuddyPreferenceInput = z.infer<typeof buddyPreferenceSchema>;
