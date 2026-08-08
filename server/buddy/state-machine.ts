type IntentLike = { status: string; mode?: string; expiresAt: Date; ownerId: string };
type ApplicationLike = { status: string; applicantId: string };
type GroupLike = { status: string };
type VisibleIntentLike = { status: string; mode: string; ownerId: string };

export function isExpired(intent: Pick<IntentLike, "expiresAt">, now = new Date()) {
  return intent.expiresAt <= now;
}

export function canApply(intent: IntentLike, applicantId: string, now = new Date()) {
  return intent.mode === "POST" && intent.status === "ACTIVE" && intent.ownerId !== applicantId && !isExpired(intent, now);
}

export function canDecideApplication(intent: IntentLike, application: ApplicationLike, ownerId: string, now = new Date()) {
  return intent.ownerId === ownerId && intent.status === "ACTIVE" && application.status === "PENDING" && !isExpired(intent, now);
}

export function canCancelIntent(intent: IntentLike, ownerId: string) {
  return intent.ownerId === ownerId && intent.status === "ACTIVE";
}

export function canSendMessage(group: GroupLike, membershipStatus: string, blocked: boolean) {
  return group.status === "ACTIVE" && membershipStatus === "ACTIVE" && !blocked;
}

export function canViewIntent(intent: VisibleIntentLike, viewerId: string, applicantIds: string[], blocked = false) {
  if (intent.ownerId === viewerId) return true;
  if (intent.mode === "AUTO") return false;
  if (intent.status === "ACTIVE") return !blocked;
  return applicantIds.includes(viewerId);
}

export function isBuddyGroupReadOnly(group: GroupLike, membershipStatus?: string) {
  return group.status !== "ACTIVE" || membershipStatus !== "ACTIVE";
}

export function canReadBuddyGroup(membershipStatus?: string) {
  return membershipStatus === "ACTIVE" || membershipStatus === "LEFT" || membershipStatus === "REMOVED";
}

export const buddyStateTesting = { isExpired, canApply, canDecideApplication, canCancelIntent, canSendMessage, canViewIntent, isBuddyGroupReadOnly, canReadBuddyGroup };
