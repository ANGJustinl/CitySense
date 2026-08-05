import type { Prisma } from "@prisma/client";
import type {
  BuddyGroupView,
  BuddyMessageView,
  BuddyPublicProfileView
} from "@/server/buddy/types";

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function publicProfile(profile: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
}): BuddyPublicProfileView {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    city: profile.city
  };
}

export function publicIntent<T extends {
  id: string;
  mode: string;
  status: string;
  routeSnapshotId: string;
  routeSnapshot: unknown;
  city: string;
  area: string | null;
  departureStart: Date;
  departureEnd: Date;
  meetingLabel: string;
  meetingArea: string | null;
  publicNote: string | null;
  preferenceSpec: unknown;
  version: number;
  createdAt: Date;
  owner: {
    buddyProfile: {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      bio: string | null;
      city: string | null;
    } | null;
  };
}>(intent: T, memberView = false) {
  const meeting = memberView
    ? { label: intent.meetingLabel, area: intent.meetingArea }
    : { label: intent.meetingArea ?? "匹配后可见", area: intent.meetingArea };
  return {
    id: intent.id,
    mode: intent.mode,
    status: intent.status,
    version: intent.version,
    routeSnapshotId: intent.routeSnapshotId,
    route: intent.routeSnapshot,
    city: intent.city,
    area: intent.area,
    departureStart: intent.departureStart.toISOString(),
    departureEnd: intent.departureEnd.toISOString(),
    meeting,
    publicNote: intent.publicNote,
    preferences: intent.preferenceSpec,
    owner: intent.owner.buddyProfile ? publicProfile(intent.owner.buddyProfile) : null,
    createdAt: intent.createdAt.toISOString()
  };
}

export function publicGroup(group: {
  id: string;
  status: string;
  version: number;
  routeSnapshotId: string;
  routeSnapshot: unknown;
  city: string;
  area: string | null;
  departureStart: Date;
  departureEnd: Date;
  meetingLabel: string;
  meetingArea: string | null;
  members: Array<{
    userId: string;
    role: string;
    status: string;
    user: {
      buddyProfile: {
        userId: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        city: string | null;
      } | null;
    };
  }>;
}, unread?: number): BuddyGroupView {
  return {
    id: group.id,
    status: group.status,
    version: group.version,
    routeSnapshotId: group.routeSnapshotId,
    route: group.routeSnapshot as BuddyGroupView["route"],
    city: group.city,
    area: group.area,
    departureStart: group.departureStart.toISOString(),
    departureEnd: group.departureEnd.toISOString(),
    meeting: { label: group.meetingLabel, area: group.meetingArea },
    members: group.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      status: member.status,
      profile: member.user.buddyProfile ? publicProfile(member.user.buddyProfile) : null
    })),
    ...(unread === undefined ? {} : { unread })
  };
}

export function publicMessage(message: {
  id: string;
  groupId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  sender: {
    buddyProfile: {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      bio: string | null;
      city: string | null;
    } | null;
  };
}): BuddyMessageView {
  return {
    id: message.id,
    groupId: message.groupId,
    senderId: message.senderId,
    body: message.deletedAt ? "消息已删除" : message.body,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
    sender: message.sender.buddyProfile ? publicProfile(message.sender.buddyProfile) : null
  };
}
