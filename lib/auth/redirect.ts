export const AUTH_INTENTS = ["login", "register", "recovery"] as const;

export type AuthIntent = (typeof AUTH_INTENTS)[number];
export type AuthPageIntent = Exclude<AuthIntent, "recovery">;

export function parseAuthIntent(value: string | null | undefined): AuthIntent {
  return value === "register" || value === "recovery" ? value : "login";
}

export function safeAuthNext(
  value: string | null | undefined,
  fallback = "/submit-place"
) {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "https://citysense.local");
    return parsed.origin === "https://citysense.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function buildAuthPath(
  intent: AuthPageIntent,
  nextPath: string,
  error?: string
) {
  const params = new URLSearchParams({ next: safeAuthNext(nextPath) });
  if (error) params.set("error", error);
  return `/${intent}?${params.toString()}`;
}
