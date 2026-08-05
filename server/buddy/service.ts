import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { BuddyError, assertBuddy } from "@/server/buddy/errors";
import { createBuddyIntentSchema, buddyProfileSchema, applyBuddySchema, decideBuddyApplicationSchema, versionSchema, buddyPreferenceSchema } from "@/server/buddy/schema";
import { resolveBuddyRouteSnapshot } from "@/server/buddy/route-snapshot";
import { publicIntent, toJson } from "@/server/buddy/visibility";
import { canApply, canCancelIntent, canDecideApplication } from "@/server/buddy/state-machine";
import { isCompatibleCandidate, scoreBuddyMatch, type MatchableIntent } from "@/server/buddy/matching";
import { loadUserProfile, type UserProfileSnapshot } from "@/server/recommendation/user-profile-v2";
import { createNotification } from "@/server/buddy/notifications";

const intentInclude = { owner: { include: { buddyProfile: true } } } as const;

async function blockedBetween(a: string, b: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return Boolean(await tx.buddyBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true }
  }));
}

async function requireProfile(userId: string) {
  const profile = await prisma.buddyPublicProfile.findUnique({ where: { userId } });
  if (!profile) throw new BuddyError("buddy_profile_required", "请先完善搭子公开资料", 422);
  return profile;
}

export async function getBuddyProfile(userId: string) {
  return prisma.buddyPublicProfile.findUnique({ where: { userId } });
}

export async function saveBuddyProfile(userId: string, payload: unknown) {
  const data = buddyProfileSchema.parse(payload);
  return prisma.buddyPublicProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });
}

export async function createBuddyIntent(userId: string, payload: unknown, idempotencyKey?: string) {
  await requireProfile(userId);
  const data = createBuddyIntentSchema.parse(payload);
  if (data.departureStart <= new Date()) throw new BuddyError("departure_in_past", "出行时间必须晚于现在", 422);
  if (idempotencyKey) {
    const existing = await prisma.buddyIntent.findUnique({
      where: { ownerId_idempotencyKey: { ownerId: userId, idempotencyKey } }, include: intentInclude
    });
    if (existing) return { intent: publicIntent(existing, true), match: null };
  }
  const route = await resolveBuddyRouteSnapshot(data.routeSnapshotId, userId);
  const profile = await loadUserProfile(userId);
  const intent = await prisma.buddyIntent.create({
    data: {
      ownerId: userId,
      idempotencyKey,
      mode: data.mode,
      routeSnapshotId: data.routeSnapshotId,
      recommendationId: route.parsed.recommendationId,
      routeLocalId: route.parsed.routeLocalId,
      routeSnapshot: route.json,
      city: route.snapshot.city,
      area: route.snapshot.area,
      departureStart: data.departureStart,
      departureEnd: data.departureEnd,
      timezone: data.timezone,
      meetingLabel: data.meetingLabel,
      meetingArea: data.meetingArea,
      meetingLat: null,
      meetingLng: null,
      publicNote: data.publicNote,
      preferenceSpec: toJson(data.preferences),
      algorithmSnapshot: toJson({
        version: 1,
        profileVersion: profile.profileVersion,
        confidence: profile.confidence,
        positiveWeights: profile.positiveWeights.filter((item) => item.weight > 0).slice(0, 30)
      }),
      capacity: 2,
      expiresAt: data.departureStart
    },
    include: intentInclude
  });
  return { intent: publicIntent(intent, true), match: null };
}

export async function listBuddyIntents(userId: string, routeSnapshotId?: string) {
  const now = new Date();
  await prisma.buddyIntent.updateMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED", version: { increment: 1 } } });
  const [publicRows, mine, applications, groups] = await Promise.all([
    prisma.buddyIntent.findMany({
      where: { mode: "POST", status: "ACTIVE", expiresAt: { gt: now }, ownerId: { not: userId }, ...(routeSnapshotId ? { routeSnapshotId } : {}) },
      include: intentInclude, orderBy: { createdAt: "desc" }, take: 50
    }),
    prisma.buddyIntent.findMany({ where: { ownerId: userId }, include: intentInclude, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.buddyApplication.findMany({ where: { applicantId: userId }, include: { intent: { include: intentInclude } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.buddyGroup.findMany({ where: { members: { some: { userId } } }, include: { members: { include: { user: { include: { buddyProfile: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  const visible = [];
  for (const row of publicRows) if (!(await blockedBetween(userId, row.ownerId))) visible.push(publicIntent(row));
  return {
    intents: visible,
    mine: mine.map((row) => publicIntent(row, true)),
    applications: applications.map((row) => ({ id: row.id, status: row.status, message: row.message, intent: publicIntent(row.intent), createdAt: row.createdAt.toISOString() })),
    groups: groups.map((group) => ({
      id: group.id, status: group.status, routeSnapshotId: group.routeSnapshotId, route: group.routeSnapshot,
      departureStart: group.departureStart.toISOString(), departureEnd: group.departureEnd.toISOString(),
      meetingLabel: group.meetingLabel,
      members: group.members.map((member) => ({ userId: member.userId, role: member.role, status: member.status, profile: member.user.buddyProfile }))
    }))
  };
}

export async function getBuddyIntent(userId: string, id: string) {
  const intent = await prisma.buddyIntent.findUnique({ include: { ...intentInclude, applications: { include: { applicant: { include: { buddyProfile: true } } }, orderBy: { createdAt: "desc" } } }, where: { id } });
  if (!intent || (intent.mode === "AUTO" && intent.ownerId !== userId) || await blockedBetween(userId, intent.ownerId)) throw new BuddyError("intent_not_found", "组队意向不存在", 404);
  return {
    ...publicIntent(intent, intent.ownerId === userId),
    isOwner: intent.ownerId === userId,
    applications: intent.ownerId === userId ? intent.applications.map((application) => ({
      id: application.id, status: application.status, version: application.version, message: application.message,
      applicant: application.applicant.buddyProfile, createdAt: application.createdAt.toISOString()
    })) : undefined,
    myApplication: intent.applications.find((item) => item.applicantId === userId)?.status ?? null
  };
}

export async function cancelBuddyIntent(userId: string, id: string, payload: unknown) {
  const input = versionSchema.parse(payload);
  const intent = await prisma.buddyIntent.findUnique({ where: { id } });
  if (!intent) throw new BuddyError("intent_not_found", "组队意向不存在", 404);
  assertBuddy(canCancelIntent(intent, userId), "intent_not_active", "当前意向不能取消", 409);
  const changed = await prisma.buddyIntent.updateMany({ where: { id, ownerId: userId, status: "ACTIVE", version: input.version }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
  if (changed.count !== 1) throw new BuddyError("version_conflict", "意向状态已更新，请刷新", 409);
  await prisma.buddyApplication.updateMany({ where: { intentId: id, status: "PENDING" }, data: { status: "CANCELLED", version: { increment: 1 } } });
  return { ok: true };
}

export async function applyToBuddyIntent(userId: string, intentId: string, payload: unknown) {
  await requireProfile(userId);
  const input = applyBuddySchema.parse(payload);
  const intent = await prisma.buddyIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new BuddyError("intent_not_found", "组队意向不存在", 404);
  assertBuddy(canApply(intent, userId), "intent_not_active", "当前意向不能申请", 409);
  if (await blockedBetween(userId, intent.ownerId)) throw new BuddyError("blocked_relation", "无法申请该组队", 404);
  const existing = await prisma.buddyApplication.findUnique({ where: { intentId_applicantId: { intentId, applicantId: userId } } });
  if (existing) return existing;
  const application = await prisma.$transaction(async (tx) => {
    const created = await tx.buddyApplication.create({ data: { intentId, applicantId: userId, message: input.message } });
    await createNotification(tx, { userId: intent.ownerId, type: "APPLICATION_RECEIVED", actorUserId: userId, intentId, applicationId: created.id });
    return created;
  });
  return application;
}

async function createGroupInTransaction(tx: Prisma.TransactionClient, input: {
  intent: { id: string; ownerId: string; mode: "POST" | "AUTO"; routeSnapshotId: string; routeSnapshot: Prisma.JsonValue; city: string; area: string | null; departureStart: Date; departureEnd: Date; timezone: string; meetingLabel: string; meetingArea: string | null; meetingLat: number | null; meetingLng: number | null };
  memberId: string;
}) {
  return tx.buddyGroup.create({
    data: {
      sourceMode: input.intent.mode,
      routeSnapshotId: input.intent.routeSnapshotId,
      routeSnapshot: input.intent.routeSnapshot as Prisma.InputJsonValue,
      city: input.intent.city, area: input.intent.area, departureStart: input.intent.departureStart, departureEnd: input.intent.departureEnd,
      timezone: input.intent.timezone, meetingLabel: input.intent.meetingLabel, meetingArea: input.intent.meetingArea,
      meetingLat: input.intent.meetingLat, meetingLng: input.intent.meetingLng, createdById: input.intent.ownerId,
      members: { create: [{ userId: input.intent.ownerId, role: "OWNER" }, { userId: input.memberId, role: "MEMBER" }] }
    },
    include: { members: true }
  });
}

export async function decideBuddyApplication(userId: string, applicationId: string, payload: unknown) {
  const input = decideBuddyApplicationSchema.parse(payload);
  return prisma.$transaction(async (tx) => {
    const application = await tx.buddyApplication.findUnique({ where: { id: applicationId }, include: { intent: true } });
    if (!application) throw new BuddyError("application_not_found", "申请不存在", 404);
    assertBuddy(canDecideApplication(application.intent, application, userId), "application_already_decided", "申请已处理或意向不可用", 409);
    if (input.version !== application.version) throw new BuddyError("version_conflict", "申请状态已更新", 409);
    if (input.decision === "reject") {
      return tx.buddyApplication.update({ where: { id: applicationId }, data: { status: "REJECTED", decidedAt: new Date(), version: { increment: 1 } } });
    }
    if (await blockedBetween(application.intent.ownerId, application.applicantId, tx)) throw new BuddyError("blocked_relation", "无法接受该申请", 409);
    const changed = await tx.buddyIntent.updateMany({ where: { id: application.intentId, status: "ACTIVE", version: application.intent.version }, data: { status: "MATCHED", matchedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new BuddyError("match_conflict", "该意向已被处理", 409);
    await tx.buddyApplication.update({ where: { id: applicationId }, data: { status: "ACCEPTED", decidedAt: new Date(), version: { increment: 1 } } });
    await tx.buddyApplication.updateMany({ where: { intentId: application.intentId, id: { not: applicationId }, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), version: { increment: 1 } } });
    const group = await createGroupInTransaction(tx, { intent: application.intent, memberId: application.applicantId });
    await createNotification(tx, { userId: application.applicantId, type: "APPLICATION_ACCEPTED", actorUserId: userId, intentId: application.intentId, applicationId, groupId: group.id });
    return group;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function profileFromSnapshot(value: Prisma.JsonValue): UserProfileSnapshot {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const weights = Array.isArray(data.positiveWeights) ? data.positiveWeights : [];
  const confidence: UserProfileSnapshot["confidence"] = data.confidence === "high" || data.confidence === "medium" ? data.confidence : "low";
  return { profileVersion: Number(data.profileVersion ?? 3), updatedFrom: "intent", generatedAt: new Date(0).toISOString(), effectiveFrom: null, state: "ready", sampleSize: weights.length, decayWindowDays: 90, confidence, positiveWeights: weights as UserProfileSnapshot["positiveWeights"], negativeWeights: [], explicitTags: { approved: [], disapproved: [], skipped: [] }, sourceAffinity: 50, areaAffinity: 50, budgetAffinity: 50, quietnessAffinity: 50, popularityAffinity: 50, moodAffinity: {}, recentExposure: { itemIds: [], routeTitles: [], windowDays: 14, capturedAt: new Date(0).toISOString() }, topReasons: [] };
}

function toMatchable(intent: Awaited<ReturnType<typeof prisma.buddyIntent.findUnique>> & {}): MatchableIntent {
  const preferences = buddyPreferenceSchema.parse(intent.preferenceSpec);
  return { id: intent.id, ownerId: intent.ownerId, routeSnapshotId: intent.routeSnapshotId, status: intent.status, mode: intent.mode, departureStart: intent.departureStart, departureEnd: intent.departureEnd, expiresAt: intent.expiresAt, meetingArea: intent.meetingArea, createdAt: intent.createdAt, preferences, profile: profileFromSnapshot(intent.algorithmSnapshot ?? {}) };
}

export async function retryAutoMatch(userId: string, intentId: string) {
  const intent = await prisma.buddyIntent.findFirst({ where: { id: intentId, ownerId: userId, mode: "AUTO", status: "ACTIVE" } });
  if (!intent) throw new BuddyError("intent_not_active", "自动匹配意向不可用", 409);
  const candidates = await prisma.buddyIntent.findMany({ where: { id: { not: idFrom(intent) }, ownerId: { not: userId }, mode: "AUTO", status: "ACTIVE", routeSnapshotId: intent.routeSnapshotId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" }, take: 50 });
  const source = toMatchable(intent);
  const ranked: Array<{ candidate: typeof candidates[number]; score: number }> = [];
  for (const candidate of candidates) {
    if (await blockedBetween(userId, candidate.ownerId)) continue;
    const matchable = toMatchable(candidate);
    if (isCompatibleCandidate(source, matchable)) ranked.push({ candidate, score: scoreBuddyMatch(source, matchable).score });
  }
  ranked.sort((a, b) => b.score - a.score || a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime() || a.candidate.id.localeCompare(b.candidate.id));
  for (const { candidate, score } of ranked.slice(0, 5)) {
    try {
      return await prisma.$transaction(async (tx) => {
        const [freshA, freshB] = await Promise.all([tx.buddyIntent.findUnique({ where: { id: intent.id } }), tx.buddyIntent.findUnique({ where: { id: candidate.id } })]);
        if (!freshA || !freshB || freshA.status !== "ACTIVE" || freshB.status !== "ACTIVE" || await blockedBetween(freshA.ownerId, freshB.ownerId, tx)) throw new BuddyError("match_conflict", "候选已变化", 409);
        const [a, b] = await Promise.all([
          tx.buddyIntent.updateMany({ where: { id: freshA.id, status: "ACTIVE", version: freshA.version }, data: { status: "MATCHED", matchedAt: new Date(), version: { increment: 1 } } }),
          tx.buddyIntent.updateMany({ where: { id: freshB.id, status: "ACTIVE", version: freshB.version }, data: { status: "MATCHED", matchedAt: new Date(), version: { increment: 1 } } })
        ]);
        if (a.count !== 1 || b.count !== 1) throw new BuddyError("match_conflict", "候选已被匹配", 409);
        const group = await createGroupInTransaction(tx, { intent: freshA, memberId: freshB.ownerId });
        await Promise.all([
          createNotification(tx, { userId: freshA.ownerId, type: "AUTO_MATCHED", actorUserId: freshB.ownerId, groupId: group.id, payload: toJson({ score }) }),
          createNotification(tx, { userId: freshB.ownerId, type: "AUTO_MATCHED", actorUserId: freshA.ownerId, groupId: group.id, payload: toJson({ score }) })
        ]);
        return { matched: true, groupId: group.id, score };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof BuddyError && error.code === "match_conflict")) throw error;
    }
  }
  return { matched: false };
}

function idFrom(intent: { id: string }) { return intent.id; }
