export type BuddyPublicProfileView = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
};

export type BuddyRouteView = {
  version: 1;
  id: string;
  title: string;
  summary: string;
  city: string;
  area?: string;
  durationMinutes: number;
  stops: Array<{ id: string; name: string; area?: string; tags: string[] }>;
};

export type BuddyIntentView = {
  id: string;
  mode: string;
  status: string;
  version: number;
  routeSnapshotId: string;
  route: BuddyRouteView;
  city: string;
  area: string | null;
  departureStart: string;
  departureEnd: string;
  meeting: { label: string; area: string | null };
  publicNote: string | null;
  preferences: {
    version: number;
    hard: { pace?: string; budget?: string; smoking?: string; meetingAreas: string[] };
    soft: { interests: string[]; quietness?: string; popularity?: string; moods: string[] };
    publicLabels: string[];
  };
  owner: BuddyPublicProfileView | null;
  createdAt: string;
};

export type BuddyApplicationView = {
  id: string;
  status: string;
  version?: number;
  message: string | null;
  applicant?: BuddyPublicProfileView | null;
  intent?: BuddyIntentView;
  createdAt: string;
};

export type BuddyGroupMemberView = {
  userId: string;
  role: string;
  status: string;
  profile: BuddyPublicProfileView | null;
};

export type BuddyGroupView = {
  id: string;
  status: string;
  version: number;
  routeSnapshotId: string;
  route: BuddyRouteView;
  city: string;
  area: string | null;
  departureStart: string;
  departureEnd: string;
  meeting: { label: string; area: string | null };
  members: BuddyGroupMemberView[];
  unread?: number;
};

export type BuddyMessageView = {
  id: string;
  groupId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  sender: BuddyPublicProfileView | null;
};

export type BuddyDashboardView = {
  intents: BuddyIntentView[];
  mine: BuddyIntentView[];
  applications: BuddyApplicationView[];
  groups: BuddyGroupView[];
};
