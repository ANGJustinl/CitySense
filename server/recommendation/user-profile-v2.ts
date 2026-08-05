import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { Budget, Candidate, Mood } from "@/server/recommendation/types";
import { FEEDBACK_INTERACTION_WEIGHT } from "@/server/recommendation/feedback-weights";

/**
 * 统一的站内用户画像引擎。
 *
 * RecommendationFeedback / 显式表态是审计事实，UserInteraction 是可重建投影；
 * UserPreference.metadata.profile 只是缓存快照。profileResetAt 之前的事实永不再参与画像。
 */
export const PROFILE_VERSION = 3;
export const PROFILE_DECAY_WINDOW_DAYS = 90;
export const PROFILE_REFRESH_TTL_MS = 30 * 60 * 1000;
export const PROFILE_EXPOSURE_WINDOW_DAYS = 14;
export const NEGATIVE_PREFERENCE_MIN_SAMPLES = 2;
export const NEGATIVE_PREFERENCE_HARD_CAP = 30;
export const POSITIVE_PREFERENCE_HARD_CAP = 60;
export const AFFINITY_NEUTRAL = 50;

const DAY_MS = 86_400_000;
const FEEDBACK_ACTIONS = new Set(["up", "down", "save", "dismiss"]);
const IMPORT_ACTIONS = new Set(["liked", "saved", "rated", "watched", "followed"]);
const EXPLICIT_ACTIONS = new Set(["tag_approve", "tag_disapprove", "tag_skip"]);

const IMPORT_ACTION_WEIGHT: Record<string, number> = {
  liked: 1,
  saved: 1.4,
  rated: 1.2,
  watched: 0.8,
  followed: 1
};

const EXPLICIT_ACTION_WEIGHT: Record<string, number> = {
  tag_approve: 2,
  tag_disapprove: -2,
  tag_skip: 0
};

export type PreferenceDimension =
  | "venue"
  | "tag"
  | "source"
  | "area"
  | "budget"
  | "quietness"
  | "popularity"
  | "mood";

export type PreferenceWeight = {
  dimension: PreferenceDimension;
  key: string;
  weight: number;
  sampleSize: number;
  source?: "explicit" | "feedback" | "import";
};

export type UserProfileState = "empty" | "building" | "ready" | "reset" | "degraded";

export type UserProfileSnapshot = {
  profileVersion: number;
  updatedFrom: string;
  generatedAt: string;
  effectiveFrom: string | null;
  state: UserProfileState;
  sampleSize: number;
  decayWindowDays: number;
  confidence: "low" | "medium" | "high";
  positiveWeights: PreferenceWeight[];
  negativeWeights: PreferenceWeight[];
  explicitTags: {
    approved: string[];
    disapproved: string[];
    skipped: string[];
  };
  sourceAffinity: number;
  areaAffinity: number;
  budgetAffinity: number;
  quietnessAffinity: number;
  popularityAffinity: number;
  moodAffinity: Record<string, number>;
  recentExposure: {
    itemIds: string[];
    routeTitles: string[];
    windowDays: number;
    capturedAt: string;
  };
  topReasons: string[];
};

export const EMPTY_USER_PROFILE: UserProfileSnapshot = createEmptyProfile();

function createEmptyProfile(resetAt?: Date | null): UserProfileSnapshot {
  const effectiveFrom = resetAt?.toISOString() ?? null;
  return {
    profileVersion: PROFILE_VERSION,
    updatedFrom: effectiveFrom ? "reset" : "empty",
    generatedAt: effectiveFrom ?? new Date(0).toISOString(),
    effectiveFrom,
    state: effectiveFrom ? "reset" : "empty",
    sampleSize: 0,
    decayWindowDays: PROFILE_DECAY_WINDOW_DAYS,
    confidence: "low",
    positiveWeights: [],
    negativeWeights: [],
    explicitTags: { approved: [], disapproved: [], skipped: [] },
    sourceAffinity: AFFINITY_NEUTRAL,
    areaAffinity: AFFINITY_NEUTRAL,
    budgetAffinity: AFFINITY_NEUTRAL,
    quietnessAffinity: AFFINITY_NEUTRAL,
    popularityAffinity: AFFINITY_NEUTRAL,
    moodAffinity: {},
    recentExposure: {
      itemIds: [],
      routeTitles: [],
      windowDays: PROFILE_EXPOSURE_WINDOW_DAYS,
      capturedAt: effectiveFrom ?? new Date(0).toISOString()
    },
    topReasons: []
  };
}

type WeightedDimensionRow = {
  dimension: PreferenceDimension;
  key: string;
  rawWeight: number;
  eventIds: Set<string>;
  direct: boolean;
  source: "explicit" | "feedback" | "import";
};

type InteractionLike = {
  id: string;
  recommendationId: string | null;
  routeId: string | null;
  itemId: string | null;
  action: string;
  weight: number;
  feedbackId?: string | null;
  signalKind?: string | null;
  context: unknown;
  createdAt: Date;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readContext(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function contextTags(context: unknown): string[] {
  const tags = readContext(context).tags;
  return Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    : [];
}

function contextString(context: unknown, key: string): string | undefined {
  const value = readContext(context)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function contextNumber(context: unknown, key: string): number | undefined {
  const value = readContext(context)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function canonicalizeProfileArea(area: string | undefined): string | undefined {
  const normalized = area?.trim().replace(/(市|区|县)$/u, "");
  return normalized || undefined;
}

export function bucketPriceLevel(value: number | undefined): Budget | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 1) return "low";
  if (value <= 2) return "medium";
  return "high";
}

export function bucketQuietness(value: number | undefined): "lively" | "balanced" | "quiet" | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 33) return "lively";
  if (value <= 66) return "balanced";
  return "quiet";
}

export function bucketPopularity(value: number | undefined): "low" | "medium" | "high" | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 33) return "low";
  if (value <= 66) return "medium";
  return "high";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function positiveDecay(ageDays: number) {
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.72;
  if (ageDays <= 30) return 0.42;
  return 0.18;
}

function negativeDecay(ageDays: number) {
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.5;
  if (ageDays <= 30) return 0.2;
  return 0.05;
}

function confidenceFor(sampleSize: number): UserProfileSnapshot["confidence"] {
  if (sampleSize < 5) return "low";
  if (sampleSize < 15) return "medium";
  return "high";
}

function stateFor(sampleSize: number): UserProfileState {
  if (sampleSize === 0) return "empty";
  if (sampleSize < 5) return "building";
  return "ready";
}

function eventKey(interaction: InteractionLike): string {
  if (interaction.feedbackId) {
    return interaction.feedbackId;
  }
  if (interaction.recommendationId && interaction.routeId) {
    return `${interaction.recommendationId}:${interaction.routeId}`;
  }
  return interaction.id;
}

/** Feedback uses the latest route decision; imports/explicit events remain append-only. */
export function selectEffectiveInteractions<T extends InteractionLike>(interactions: T[]): T[] {
  const latestRouteFeedback = new Map<string, T[]>();
  const others: T[] = [];

  for (const interaction of [...interactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!FEEDBACK_ACTIONS.has(interaction.action)) {
      others.push(interaction);
      continue;
    }
    const routeKey = `${interaction.recommendationId ?? ""}|${interaction.routeId ?? ""}`;
    const current = latestRouteFeedback.get(routeKey);
    if (!current || interaction.createdAt.getTime() > current[0].createdAt.getTime()) {
      latestRouteFeedback.set(routeKey, [interaction]);
    } else if (interaction.createdAt.getTime() === current[0].createdAt.getTime()) {
      current.push(interaction);
    }
  }

  const feedbackRows: T[] = [];
  for (const group of latestRouteFeedback.values()) {
    feedbackRows.push(...group);
  }
  return [...others, ...feedbackRows];
}

function addDimension(
  rows: Map<string, WeightedDimensionRow>,
  dimension: PreferenceDimension,
  key: string | undefined,
  rawWeight: number,
  logicalEventId: string,
  direct: boolean,
  source: WeightedDimensionRow["source"]
) {
  if (!key || rawWeight === 0) return;
  const mapKey = `${dimension}:${key}`;
  const existing = rows.get(mapKey);
  if (existing) {
    if (!existing.eventIds.has(logicalEventId)) {
      existing.rawWeight += rawWeight;
      existing.eventIds.add(logicalEventId);
    }
    existing.direct ||= direct;
    if (source === "explicit") existing.source = source;
    return;
  }
  rows.set(mapKey, {
    dimension,
    key,
    rawWeight,
    eventIds: new Set([logicalEventId]),
    direct,
    source
  });
}

function normalizeWeights(
  rows: Map<string, WeightedDimensionRow>,
  sign: 1 | -1
): PreferenceWeight[] {
  const cap = sign > 0 ? POSITIVE_PREFERENCE_HARD_CAP : NEGATIVE_PREFERENCE_HARD_CAP;
  return [...rows.values()]
    .filter((row) => sign > 0 || row.direct || row.eventIds.size >= NEGATIVE_PREFERENCE_MIN_SAMPLES)
    .map((row) => ({
      dimension: row.dimension,
      key: row.key,
      weight: clamp(Math.round(Math.abs(row.rawWeight) * 10) / 10, 0, cap),
      sampleSize: row.eventIds.size,
      source: row.source
    }))
    .sort((a, b) => b.weight - a.weight);
}

function latestExplicitTags(interactions: InteractionLike[]) {
  const byTag = new Map<string, { action: string; createdAt: Date }>();
  for (const interaction of interactions) {
    if (!EXPLICIT_ACTIONS.has(interaction.action)) continue;
    const tag = contextTags(interaction.context)[0];
    if (!tag) continue;
    const current = byTag.get(tag);
    if (!current || interaction.createdAt >= current.createdAt) {
      byTag.set(tag, { action: interaction.action, createdAt: interaction.createdAt });
    }
  }
  const approved: string[] = [];
  const disapproved: string[] = [];
  const skipped: string[] = [];
  for (const [tag, value] of byTag) {
    if (value.action === "tag_approve") approved.push(tag);
    else if (value.action === "tag_disapprove") disapproved.push(tag);
    else skipped.push(tag);
  }
  return { approved, disapproved, skipped };
}

function baseWeight(interaction: InteractionLike): number {
  if (EXPLICIT_ACTIONS.has(interaction.action)) return EXPLICIT_ACTION_WEIGHT[interaction.action] ?? 0;
  if (IMPORT_ACTIONS.has(interaction.action)) return IMPORT_ACTION_WEIGHT[interaction.action] ?? 0;
  if (FEEDBACK_ACTIONS.has(interaction.action)) {
    return (FEEDBACK_INTERACTION_WEIGHT as Record<string, number>)[interaction.action] ?? 0;
  }
  return interaction.weight ?? 0;
}

function buildTopReasons(positive: PreferenceWeight[], negative: PreferenceWeight[], exposureCount: number) {
  const reasons = [
    ...positive.slice(0, 4).map((weight) => `${weight.dimension}:${weight.key} +${weight.weight}`),
    ...negative.slice(0, 3).map((weight) => `${weight.dimension}:${weight.key} -${weight.weight}`)
  ];
  if (exposureCount > 0) reasons.push(`recentlySeen:${exposureCount} items`);
  return reasons.slice(0, 8);
}

function affinityFor(weights: PreferenceWeight[], dimension: PreferenceDimension) {
  const values = weights.filter((weight) => weight.dimension === dimension).map((weight) => weight.weight);
  if (values.length === 0) return AFFINITY_NEUTRAL;
  return clamp(Math.round(AFFINITY_NEUTRAL + values.reduce((sum, value) => sum + value, 0) / values.length), 0, 100);
}

function moodAffinityFor(weights: PreferenceWeight[]) {
  return Object.fromEntries(
    weights
      .filter((weight) => weight.dimension === "mood")
      .map((weight) => [weight.key, clamp(Math.round(AFFINITY_NEUTRAL + weight.weight), 0, 100)])
  );
}

function extractExposure(routesJson: unknown) {
  const itemIds = new Set<string>();
  const routeTitles = new Set<string>();
  if (Array.isArray(routesJson)) {
    for (const route of routesJson as Array<Record<string, unknown>>) {
      if (typeof route.title === "string") routeTitles.add(route.title);
      if (!Array.isArray(route.places)) continue;
      for (const place of route.places as Array<Record<string, unknown>>) {
        if (typeof place.id === "string") itemIds.add(place.id);
      }
    }
  }
  return { itemIds, routeTitles };
}

function parseStoredMetadata(metadata: unknown): UserProfileSnapshot | null {
  if (!metadata || typeof metadata !== "object") return null;
  const root = metadata as Record<string, unknown>;
  const value = root.profile && typeof root.profile === "object"
    ? (root.profile as Partial<UserProfileSnapshot>)
    : (metadata as Partial<UserProfileSnapshot>);
  if (value.profileVersion !== PROFILE_VERSION) return null;
  return {
    ...createEmptyProfile(value.effectiveFrom ? new Date(value.effectiveFrom) : null),
    ...value,
    explicitTags: { approved: [], disapproved: [], skipped: [], ...(value.explicitTags ?? {}) },
    recentExposure: {
      ...createEmptyProfile().recentExposure,
      ...(value.recentExposure ?? {})
    }
  } as UserProfileSnapshot;
}

function isStaleSnapshot(snapshot: UserProfileSnapshot | null, resetAt: Date | null) {
  if (!snapshot || snapshot.profileVersion !== PROFILE_VERSION) return true;
  if ((snapshot.effectiveFrom ?? null) !== (resetAt?.toISOString() ?? null)) return true;
  const generatedAt = Date.parse(snapshot.generatedAt);
  return !Number.isFinite(generatedAt) || Date.now() - generatedAt > PROFILE_REFRESH_TTL_MS;
}

export async function recomputeUserProfile(userId: string): Promise<UserProfileSnapshot> {
  if (!userId) return EMPTY_USER_PROFILE;

  try {
    const preference = await prisma.userPreference.findUnique({
      where: { userId },
      select: { metadata: true, profileResetAt: true }
    });
    const resetAt = preference?.profileResetAt ?? null;
    const decaySince = new Date(Date.now() - PROFILE_DECAY_WINDOW_DAYS * DAY_MS);
    const interactionSince = resetAt && resetAt > decaySince ? resetAt : decaySince;
    const exposureSince = new Date(Date.now() - PROFILE_EXPOSURE_WINDOW_DAYS * DAY_MS);
    const logSince = resetAt && resetAt > exposureSince ? resetAt : exposureSince;

    const [interactions, logs] = await Promise.all([
      prisma.userInteraction.findMany({
        where: { userId, createdAt: { gt: interactionSince } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 2000
      }),
      prisma.recommendationLog.findMany({
        where: { userId, createdAt: { gt: logSince } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { recommendedRoutes: true }
      })
    ]);

    const effective = selectEffectiveInteractions(interactions);
    const explicitTags = latestExplicitTags(effective);
    const positiveRows = new Map<string, WeightedDimensionRow>();
    const negativeRows = new Map<string, WeightedDimensionRow>();
    const logicalEvents = new Set<string>();

    for (const interaction of effective) {
      const weight = baseWeight(interaction);
      if (weight === 0) continue;
      const logicalEventId = eventKey(interaction);
      logicalEvents.add(logicalEventId);
      const isExplicit = EXPLICIT_ACTIONS.has(interaction.action);
      const isImport = IMPORT_ACTIONS.has(interaction.action);
      const source: WeightedDimensionRow["source"] = isExplicit ? "explicit" : isImport ? "import" : "feedback";
      const ageDays = Math.max(0, (Date.now() - interaction.createdAt.getTime()) / DAY_MS);
      const decay = isExplicit ? 1 : weight > 0 ? positiveDecay(ageDays) : negativeDecay(ageDays);
      const effectiveWeight = weight * decay;
      const rows = effectiveWeight > 0 ? positiveRows : negativeRows;
      const tags = contextTags(interaction.context);
      const area = canonicalizeProfileArea(contextString(interaction.context, "area"));
      const sourceKey = contextString(interaction.context, "source");
      const budget = contextString(interaction.context, "budget") ?? bucketPriceLevel(contextNumber(interaction.context, "priceLevel"));
      const quietness = bucketQuietness(contextNumber(interaction.context, "quietness"));
      const popularity = bucketPopularity(contextNumber(interaction.context, "popularity"));
      const mood = contextString(interaction.context, "mood");
      const reason = contextString(interaction.context, "reason");
      const directTags = reason === "interest_match" || reason === "not_interested";
      const directArea = reason === "area_match" || reason === "area_dislike";
      const directBudget = reason === "budget_match" || reason === "too_expensive";
      const directQuietness = reason === "atmosphere_match" || reason === "too_noisy";

      if (interaction.itemId && !isExplicit) {
        addDimension(rows, "venue", interaction.itemId, effectiveWeight, `${logicalEventId}:${interaction.itemId}`, true, source);
      }
      for (const tag of tags) {
        addDimension(rows, "tag", tag, effectiveWeight, logicalEventId, isExplicit || directTags, source);
      }
      addDimension(rows, "source", sourceKey, effectiveWeight, logicalEventId, false, source);
      addDimension(rows, "area", area, effectiveWeight, logicalEventId, directArea, source);
      addDimension(rows, "budget", budget, effectiveWeight, logicalEventId, directBudget, source);
      addDimension(rows, "quietness", quietness, effectiveWeight, logicalEventId, directQuietness, source);
      addDimension(rows, "popularity", popularity, effectiveWeight, logicalEventId, false, source);
      addDimension(rows, "mood", mood, effectiveWeight, logicalEventId, false, source);
    }

    const positiveWeights = normalizeWeights(positiveRows, 1);
    const negativeWeights = normalizeWeights(negativeRows, -1);
    const exposureItems = new Set<string>();
    const exposureTitles = new Set<string>();
    for (const log of logs) {
      const exposure = extractExposure(log.recommendedRoutes);
      exposure.itemIds.forEach((id) => exposureItems.add(id));
      exposure.routeTitles.forEach((title) => exposureTitles.add(title));
    }
    const generatedAt = new Date();
    const sampleSize = logicalEvents.size;
    const recentExposure = {
      itemIds: [...exposureItems].slice(0, 200),
      routeTitles: [...exposureTitles].slice(0, 50),
      windowDays: PROFILE_EXPOSURE_WINDOW_DAYS,
      capturedAt: generatedAt.toISOString()
    };
    const snapshot: UserProfileSnapshot = {
      profileVersion: PROFILE_VERSION,
      updatedFrom: "unified-signals",
      generatedAt: generatedAt.toISOString(),
      effectiveFrom: resetAt?.toISOString() ?? null,
      state: resetAt && sampleSize === 0 ? "reset" : stateFor(sampleSize),
      sampleSize,
      decayWindowDays: PROFILE_DECAY_WINDOW_DAYS,
      confidence: confidenceFor(sampleSize),
      positiveWeights,
      negativeWeights,
      explicitTags,
      sourceAffinity: affinityFor(positiveWeights, "source"),
      areaAffinity: affinityFor(positiveWeights, "area"),
      budgetAffinity: affinityFor(positiveWeights, "budget"),
      quietnessAffinity: affinityFor(positiveWeights, "quietness"),
      popularityAffinity: affinityFor(positiveWeights, "popularity"),
      moodAffinity: moodAffinityFor(positiveWeights),
      recentExposure,
      topReasons: buildTopReasons(positiveWeights, negativeWeights, exposureItems.size)
    };

    const latestPreference = await prisma.userPreference.findUnique({
      where: { userId },
      select: { metadata: true, profileResetAt: true }
    });
    if ((latestPreference?.profileResetAt?.toISOString() ?? null) !== (resetAt?.toISOString() ?? null)) {
      return recomputeUserProfile(userId);
    }
    const root = latestPreference?.metadata && typeof latestPreference.metadata === "object"
      ? (latestPreference.metadata as Record<string, unknown>)
      : {};
    await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        interests: explicitTags.approved,
        profileVersion: PROFILE_VERSION,
        signalCount: sampleSize,
        metadata: toJson({ ...root, profile: snapshot })
      },
      update: {
        interests: explicitTags.approved,
        profileVersion: PROFILE_VERSION,
        signalCount: sampleSize,
        metadata: toJson({ ...root, profile: snapshot })
      }
    });
    return snapshot;
  } catch {
    return { ...EMPTY_USER_PROFILE, state: "degraded" };
  }
}

export async function loadUserProfile(userId: string | undefined): Promise<UserProfileSnapshot> {
  if (!userId) return EMPTY_USER_PROFILE;
  try {
    const stored = await prisma.userPreference.findUnique({
      where: { userId },
      select: { metadata: true, profileResetAt: true }
    });
    const parsed = parseStoredMetadata(stored?.metadata);
    if (parsed && !isStaleSnapshot(parsed, stored?.profileResetAt ?? null)) return parsed;
    return recomputeUserProfile(userId);
  } catch {
    return { ...EMPTY_USER_PROFILE, state: "degraded" };
  }
}

export async function loadUserProfileForRanking(userId: string | undefined) {
  if (!userId) return { profile: EMPTY_USER_PROFILE, degraded: true };
  const profile = await loadUserProfile(userId);
  return { profile, degraded: profile.state === "degraded" };
}

export type ProfileFactor = {
  dimension: PreferenceDimension;
  key: string;
  delta: number;
};

export type AffinityComputation = {
  score: number;
  factors: ProfileFactor[];
  profileHit: boolean;
};

function matchWeight(weights: PreferenceWeight[], dimension: PreferenceDimension, key: string | undefined) {
  if (!key) return undefined;
  return weights.find((weight) => weight.dimension === dimension && weight.key === key);
}

function confidenceScale(profile: UserProfileSnapshot) {
  if (profile.confidence === "high") return 1;
  if (profile.confidence === "medium") return 0.7;
  return 0.35;
}

function candidateKeys(candidate: Candidate, request?: { mood?: Mood; budget?: Budget }) {
  return {
    area: canonicalizeProfileArea(candidate.area),
    budget: request?.budget ?? bucketPriceLevel(candidate.priceLevel),
    quietness: bucketQuietness(candidate.quietness),
    popularity: bucketPopularity(candidate.popularity),
    mood: request?.mood
  };
}

export function calculateUserAffinityFromProfile(
  candidate: Candidate,
  profile: UserProfileSnapshot,
  request?: { mood?: Mood; budget?: Budget }
): AffinityComputation {
  if (profile.sampleSize === 0) return { score: AFFINITY_NEUTRAL, factors: [], profileHit: false };
  const factors: ProfileFactor[] = [];
  const scale = confidenceScale(profile);
  let delta = 0;
  const add = (dimension: PreferenceDimension, key: string | undefined, max: number) => {
    const weight = matchWeight(profile.positiveWeights, dimension, key);
    if (!weight || !key) return;
    const directScale = weight.source === "explicit" ? 1 : scale;
    const contribution = clamp(weight.weight / POSITIVE_PREFERENCE_HARD_CAP, 0, 1) * max * directScale;
    delta += contribution;
    factors.push({ dimension, key, delta: Math.round(contribution * 10) / 10 });
  };
  add("venue", candidate.id, 36);
  candidate.tags.forEach((tag) => add("tag", tag, 32));
  add("source", candidate.source, 20);
  const keys = candidateKeys(candidate, request);
  add("area", keys.area, 12);
  add("budget", keys.budget, 10);
  add("quietness", keys.quietness, 10);
  add("popularity", keys.popularity, 8);
  add("mood", keys.mood, 8);
  return {
    score: clamp(Math.round(AFFINITY_NEUTRAL + delta), 0, 100),
    factors,
    profileHit: factors.length > 0
  };
}

export function calculateFeedbackPenaltyFromProfile(
  candidate: Candidate,
  profile: UserProfileSnapshot,
  request?: { mood?: Mood; budget?: Budget }
): AffinityComputation {
  if (profile.negativeWeights.length === 0) return { score: 0, factors: [], profileHit: false };
  const factors: ProfileFactor[] = [];
  const scale = confidenceScale(profile);
  let penalty = 0;
  const add = (dimension: PreferenceDimension, key: string | undefined, max: number) => {
    const weight = matchWeight(profile.negativeWeights, dimension, key);
    if (!weight || !key) return;
    const direct = dimension === "venue" || weight.source === "explicit";
    const contribution = clamp(weight.weight / NEGATIVE_PREFERENCE_HARD_CAP, 0, 1) * max * (direct ? 1 : scale);
    penalty += contribution;
    factors.push({ dimension, key, delta: -Math.round(contribution * 10) / 10 });
  };
  add("venue", candidate.id, 22);
  candidate.tags.forEach((tag) => add("tag", tag, 12));
  add("source", candidate.source, 8);
  const keys = candidateKeys(candidate, request);
  add("area", keys.area, 6);
  add("budget", keys.budget, 5);
  add("quietness", keys.quietness, 5);
  add("popularity", keys.popularity, 4);
  add("mood", keys.mood, 4);
  return {
    score: clamp(Math.round(penalty), 0, NEGATIVE_PREFERENCE_HARD_CAP),
    factors,
    profileHit: factors.length > 0
  };
}

export function calculateExposurePenalty(candidate: Candidate, profile: UserProfileSnapshot) {
  if (profile.recentExposure.itemIds.includes(candidate.id)) {
    return { penalty: 8, reason: `recentlySeen:itemId ${candidate.id}` };
  }
  if (candidate.name && profile.recentExposure.routeTitles.some((title) => title.includes(candidate.name))) {
    return { penalty: 4, reason: `recentlySeen:theme ${candidate.name}` };
  }
  return { penalty: 0 };
}

export async function getUserProfileSummary(userId: string | undefined) {
  if (!userId) {
    return { userId: null, profileVersion: PROFILE_VERSION, hasProfile: false, degraded: true, state: "degraded", summary: null };
  }
  const { profile, degraded } = await loadUserProfileForRanking(userId);
  const summary = {
    sampleSize: profile.sampleSize,
    confidence: profile.confidence,
    state: profile.state,
    effectiveFrom: profile.effectiveFrom,
    generatedAt: profile.generatedAt,
    decayWindowDays: profile.decayWindowDays,
    topPositiveTags: profile.positiveWeights.filter((w) => w.dimension === "tag").slice(0, 6).map((w) => ({ tag: w.key, weight: w.weight, sampleSize: w.sampleSize })),
    topNegativeTags: profile.negativeWeights.filter((w) => w.dimension === "tag").slice(0, 6).map((w) => ({ tag: w.key, weight: w.weight, sampleSize: w.sampleSize })),
    topSources: profile.positiveWeights.filter((w) => w.dimension === "source").slice(0, 3).map((w) => ({ source: w.key, weight: w.weight })),
    topAreas: profile.positiveWeights.filter((w) => w.dimension === "area").slice(0, 3).map((w) => ({ area: w.key, weight: w.weight })),
    budgetAffinity: profile.budgetAffinity,
    quietnessAffinity: profile.quietnessAffinity,
    popularityAffinity: profile.popularityAffinity,
    moodAffinity: profile.moodAffinity,
    topReasons: profile.topReasons,
    recentExposureCount: profile.recentExposure.itemIds.length
  };
  return {
    userId,
    profileVersion: PROFILE_VERSION,
    hasProfile: profile.sampleSize > 0,
    degraded,
    state: profile.state,
    summary
  };
}

export async function clearUserProfile(userId: string) {
  const resetAt = new Date();
  const empty = createEmptyProfile(resetAt);
  await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      interests: [],
      profileResetAt: resetAt,
      profileVersion: PROFILE_VERSION,
      signalCount: 0,
      metadata: toJson({ profile: empty })
    },
    update: {
      interests: [],
      mood: null,
      budget: null,
      profileResetAt: resetAt,
      profileVersion: PROFILE_VERSION,
      signalCount: 0,
      metadata: toJson({ profile: empty })
    }
  });
  return {
    ok: true,
    userId,
    resetAt: resetAt.toISOString(),
    profileVersion: PROFILE_VERSION,
    signalCount: 0,
    state: "reset" as const
  };
}

export const userProfileV2Testing = {
  positiveDecay,
  negativeDecay,
  stateFor,
  confidenceFor
};
