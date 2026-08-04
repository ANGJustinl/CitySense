import { isDemoUser } from "@/lib/demo-users";

export class ProfileAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message = "profile access denied", status = 403) {
    super(message);
    this.name = "ProfileAccessError";
    this.status = status;
    this.code = status === 400 ? "invalid_profile_key" : "profile_access_denied";
  }
}

export function normalizeProfileKey(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const key = value.trim();

  if (!key) {
    return undefined;
  }

  if (key.length > 128) {
    throw new ProfileAccessError("profile key too long", 400);
  }

  return key;
}

export function requireOwnedProfileKey(input: {
  requestedProfileKey?: unknown;
  sessionId?: unknown;
  allowEmpty?: boolean;
}): string | undefined {
  const requestedProfileKey = normalizeProfileKey(input.requestedProfileKey);
  const sessionId = normalizeProfileKey(input.sessionId);

  if (!requestedProfileKey) {
    if (input.allowEmpty) {
      return undefined;
    }

    throw new ProfileAccessError("profile key is required", 400);
  }

  if (isDemoUser(requestedProfileKey)) {
    return requestedProfileKey;
  }

  if (sessionId && requestedProfileKey === sessionId) {
    return requestedProfileKey;
  }

  throw new ProfileAccessError();
}

export function sanitizeProfileScopedInput<T extends Record<string, unknown>>(
  input: T
): T & { userId?: string; sessionId?: string } {
  const sessionId = normalizeProfileKey(input.sessionId);
  const userId = normalizeProfileKey(input.userId);

  if (!userId) {
    return {
      ...input,
      userId: undefined,
      sessionId
    };
  }

  return {
    ...input,
    userId: requireOwnedProfileKey({
      requestedProfileKey: userId,
      sessionId
    }),
    sessionId
  };
}
