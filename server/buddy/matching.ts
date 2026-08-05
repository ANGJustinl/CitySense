import type { BuddyPreferenceInput } from "@/server/buddy/schema";
import type { UserProfileSnapshot } from "@/server/recommendation/user-profile-v2";
import { canonicalizeProfileArea } from "@/server/recommendation/user-profile-v2";

export type MatchableIntent = {
  id: string;
  ownerId: string;
  routeSnapshotId: string;
  status: string;
  mode: string;
  departureStart: Date;
  departureEnd: Date;
  expiresAt: Date;
  meetingArea?: string | null;
  createdAt: Date;
  preferences: BuddyPreferenceInput;
  profile: UserProfileSnapshot;
};

function overlapRatio(a: MatchableIntent, b: MatchableIntent) {
  const start = Math.max(a.departureStart.getTime(), b.departureStart.getTime());
  const end = Math.min(a.departureEnd.getTime(), b.departureEnd.getTime());
  if (end <= start) return 0;
  const shorter = Math.min(a.departureEnd.getTime() - a.departureStart.getTime(), b.departureEnd.getTime() - b.departureStart.getTime());
  return Math.min(1, (end - start) / Math.max(shorter, 1));
}

function compatibleHard(a: BuddyPreferenceInput, b: BuddyPreferenceInput) {
  if (a.hard.pace && b.hard.pace && a.hard.pace !== b.hard.pace) return false;
  if (a.hard.budget && b.hard.budget && a.hard.budget !== b.hard.budget) return false;
  if (a.hard.smoking && b.hard.smoking && a.hard.smoking !== b.hard.smoking) return false;
  const areasA = new Set(a.hard.meetingAreas.map(canonicalizeProfileArea).filter(Boolean));
  const areasB = new Set(b.hard.meetingAreas.map(canonicalizeProfileArea).filter(Boolean));
  return areasA.size === 0 || areasB.size === 0 || [...areasA].some((area) => areasB.has(area));
}

export function isCompatibleCandidate(a: MatchableIntent, b: MatchableIntent, now = new Date()) {
  return a.ownerId !== b.ownerId && a.routeSnapshotId === b.routeSnapshotId &&
    a.status === "ACTIVE" && b.status === "ACTIVE" && a.mode === "AUTO" && b.mode === "AUTO" &&
    a.expiresAt > now && b.expiresAt > now && overlapRatio(a, b) > 0 && compatibleHard(a.preferences, b.preferences);
}

function positiveTags(profile: UserProfileSnapshot) {
  return new Set(profile.positiveWeights.filter((item) => item.dimension === "tag" && item.weight > 0).map((item) => item.key));
}

export function scoreBuddyMatch(a: MatchableIntent, b: MatchableIntent, now = new Date()) {
  const time = overlapRatio(a, b) * 30;
  const explicitA = new Set(a.preferences.soft.interests);
  const explicitB = new Set(b.preferences.soft.interests);
  const explicitShared = [...explicitA].filter((tag) => explicitB.has(tag));
  const explicit = (explicitShared.length / Math.max(1, Math.max(explicitA.size, explicitB.size))) * 25;
  const tagsA = positiveTags(a.profile);
  const tagsB = positiveTags(b.profile);
  const profileShared = [...tagsA].filter((tag) => tagsB.has(tag));
  const confidence = a.profile.confidence === "high" && b.profile.confidence === "high" ? 1 : a.profile.confidence === "low" || b.profile.confidence === "low" ? 0.45 : 0.75;
  const profile = (profileShared.length / Math.max(1, Math.max(tagsA.size, tagsB.size))) * 25 * confidence;
  const areaA = canonicalizeProfileArea(a.meetingArea ?? undefined);
  const areaB = canonicalizeProfileArea(b.meetingArea ?? undefined);
  const meeting = !areaA || !areaB ? 5 : areaA === areaB ? 10 : 0;
  const waitHours = Math.max(0, now.getTime() - b.createdAt.getTime()) / 3_600_000;
  const waiting = Math.min(5, waitHours / 4);
  const confidenceAdjustment = 5 * confidence;
  const score = Math.round((time + explicit + profile + meeting + waiting + confidenceAdjustment) * 10) / 10;
  const reasons: string[] = [];
  if (explicitShared.length) reasons.push(`都想体验${explicitShared.slice(0, 2).join("、")}`);
  else if (profileShared.length) reasons.push(`都喜欢${profileShared.slice(0, 2).join("、")}`);
  if (areaA && areaA === areaB) reasons.push("集合区域合适");
  if (time >= 24) reasons.push("出行时间高度重合");
  if (!reasons.length) reasons.push("路线与时间相互合适");
  return { score, reasons };
}

export const buddyMatchingTesting = { overlapRatio, compatibleHard, isCompatibleCandidate, scoreBuddyMatch };
