export class BuddyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 = 400
  ) {
    super(message);
  }
}

export function assertBuddy(condition: unknown, code: string, message: string, status: BuddyError["status"] = 400): asserts condition {
  if (!condition) throw new BuddyError(code, message, status);
}
