export type CommunityLocalDraft = {
  version: 1;
  body: string;
  city: string;
  area: string;
  venues: Array<{ id: string; name: string; area: string | null }>;
  savedAt: string;
};

export function communityDraftKey(userId: string) {
  return `citysense:community-draft:${userId}`;
}

export function parseCommunityDraft(value: string | null): CommunityLocalDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CommunityLocalDraft>;
    if (parsed.version !== 1 || typeof parsed.body !== "string" || typeof parsed.city !== "string" || typeof parsed.area !== "string" || !Array.isArray(parsed.venues) || typeof parsed.savedAt !== "string") return null;
    const venues = parsed.venues.filter((venue): venue is { id: string; name: string; area: string | null } => Boolean(venue && typeof venue.id === "string" && typeof venue.name === "string" && (venue.area === null || typeof venue.area === "string"))).slice(0, 3);
    return { version: 1, body: parsed.body, city: parsed.city, area: parsed.area, venues, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function serializeCommunityDraft(input: Omit<CommunityLocalDraft, "version" | "savedAt">, now = new Date()) {
  return JSON.stringify({ version: 1, ...input, venues: input.venues.slice(0, 3), savedAt: now.toISOString() } satisfies CommunityLocalDraft);
}
