import type { Route } from "next";

export type CommunityFeedContext =
  | { kind: "community"; city: string; scope: "city" | "following" }
  | { kind: "profile"; userId: string }
  | { kind: "bookmarks" };

export function communityPageHref(city: string, scope: "city" | "following"): Route {
  const query = new URLSearchParams({ city, scope });
  return `/community?${query.toString()}` as Route;
}

export function communityFeedApiHref(context: CommunityFeedContext, cursor: string) {
  const query = new URLSearchParams({ cursor });
  if (context.kind === "community") {
    query.set("city", context.city);
    query.set("scope", context.scope);
    return `/api/community/feed?${query.toString()}`;
  }
  if (context.kind === "profile") {
    return `/api/community/profiles/${encodeURIComponent(context.userId)}/posts?${query.toString()}`;
  }
  return `/api/community/me/bookmarks?${query.toString()}`;
}

export function communityFeedContextKey(context: CommunityFeedContext) {
  if (context.kind === "community") return `community:${context.city}:${context.scope}`;
  if (context.kind === "profile") return `profile:${context.userId}`;
  return "bookmarks";
}
