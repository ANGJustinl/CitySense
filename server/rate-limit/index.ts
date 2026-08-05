import { getSharedRedis } from "@/server/redis/shared";

export class RateLimitError extends Error {
  readonly code = "rate_limited";
  readonly status = 429;

  constructor(readonly retryAfter: number) {
    super("请求过于频繁，请稍后再试");
  }
}

export class RateLimitUnavailableError extends Error {
  readonly code = "rate_limit_unavailable";
  readonly status = 503;

  constructor() {
    super("暂时无法验证请求频率，请稍后再试");
  }
}

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
};

export const RATE_LIMITS = {
  submissionCreate: { limit: 5, windowSeconds: 86_400, failClosed: true },
  submissionImage: { limit: 30, windowSeconds: 3_600, failClosed: true },
  submissionSubmit: { limit: 10, windowSeconds: 86_400, failClosed: true },
  communityPost: { limit: 10, windowSeconds: 3_600, failClosed: true },
  communityComment: { limit: 20, windowSeconds: 600, failClosed: true },
  communityReaction: { limit: 120, windowSeconds: 60, failClosed: true },
  communityFollow: { limit: 30, windowSeconds: 3_600, failClosed: true },
  communityReport: { limit: 10, windowSeconds: 3_600, failClosed: true }
} satisfies Record<string, RateLimitPolicy>;

export async function enforceRateLimit(action: string, subject: string, policy: RateLimitPolicy) {
  const redis = getSharedRedis();
  if (!redis) {
    if (policy.failClosed) throw new RateLimitUnavailableError();
    return { remaining: policy.limit, retryAfter: 0 };
  }
  const bucket = Math.floor(Date.now() / (policy.windowSeconds * 1_000));
  const key = `citysense:rate:${action}:${subject}:${bucket}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, policy.windowSeconds + 1);
    const retryAfter = policy.windowSeconds - Math.floor((Date.now() / 1_000) % policy.windowSeconds);
    if (count > policy.limit) throw new RateLimitError(retryAfter);
    return { remaining: Math.max(0, policy.limit - count), retryAfter };
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    if (policy.failClosed) throw new RateLimitUnavailableError();
    return { remaining: policy.limit, retryAfter: 0 };
  }
}

export function rateLimitErrorResponse(error: unknown) {
  if (error instanceof RateLimitError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "retry-after": String(error.retryAfter) } }
    );
  }
  if (error instanceof RateLimitUnavailableError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return null;
}
