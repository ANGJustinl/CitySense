export class CommunityError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

export function communityErrorResponse(error: unknown) {
  if (!(error instanceof CommunityError)) return null;
  return Response.json({ error: error.message, code: error.code }, { status: error.status });
}
