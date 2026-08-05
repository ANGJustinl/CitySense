export type BuddyComposeMode = "POST" | "AUTO";
export type BuddyHubTab = "discover" | "mine" | "groups";

export function parseBuddyCompose(value: string | null | undefined): BuddyComposeMode | undefined {
  return value === "POST" || value === "AUTO" ? value : undefined;
}

export function parseBuddyTab(value: string | null | undefined): BuddyHubTab {
  return value === "mine" || value === "groups" ? value : "discover";
}

export function buddyComposePath(input: { routeId: string; mode: BuddyComposeMode; tab?: BuddyHubTab }) {
  const params = new URLSearchParams({ routeId: input.routeId, compose: input.mode });
  if (input.tab) params.set("tab", input.tab);
  return `/buddy?${params.toString()}`;
}
