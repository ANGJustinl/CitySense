import type { BuddyComposeMode } from "@/lib/buddy-navigation";

export type BuddyPace = "relaxed" | "balanced" | "fast";

export function buildBuddyIntentPayload(input: { mode: BuddyComposeMode; routeId: string; start: string; end: string; meetingLabel: string; meetingArea: string; interests: string; note: string; pace: BuddyPace }) {
  return {
    mode: input.mode,
    routeSnapshotId: input.routeId,
    departureStart: new Date(input.start).toISOString(),
    departureEnd: new Date(input.end).toISOString(),
    meetingLabel: input.meetingLabel.trim(),
    meetingArea: input.meetingArea.trim() || undefined,
    publicNote: input.note.trim() || undefined,
    preferences: {
      version: 1 as const,
      hard: { pace: input.pace, meetingAreas: input.meetingArea.trim() ? [input.meetingArea.trim()] : [] },
      soft: { interests: input.interests.split(/[，,]/).map((item) => item.trim()).filter(Boolean), moods: [] },
      publicLabels: [input.mode === "POST" ? "欢迎申请" : "自动匹配", ({ relaxed: "慢慢走", balanced: "自在逛", fast: "高效打卡" } as const)[input.pace]]
    }
  };
}

export function validateBuddySchedule(start: string, end: string, now = Date.now()) {
  if (!start || new Date(start).getTime() <= now) return "开始时间必须晚于现在";
  if (!end || new Date(end).getTime() <= new Date(start).getTime()) return "结束时间必须晚于开始时间";
  return undefined;
}
