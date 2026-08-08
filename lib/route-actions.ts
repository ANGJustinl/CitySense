export function routeShareUrl(routeId: string, origin: string) {
  return new URL(`/routes/${routeId}`, origin).toString();
}

export function buildSaveFeedbackPayload(input: { recommendationId: string; routeId: string; userId?: string; sessionId?: string }) {
  return {
    recommendationLogId: input.recommendationId,
    routeId: input.routeId,
    userId: input.userId,
    sessionId: input.sessionId,
    value: "save" as const
  };
}
