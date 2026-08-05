import IORedis from "ioredis";

let redisInstance: IORedis | null | undefined;

export function getSharedRedis() {
  if (redisInstance !== undefined) return redisInstance;
  if (!process.env.REDIS_URL) {
    redisInstance = null;
    return null;
  }
  try {
    const redis = new IORedis(process.env.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: false,
      maxRetriesPerRequest: 1
    });
    redis.on("error", () => undefined);
    redisInstance = redis;
    return redis;
  } catch {
    redisInstance = null;
    return null;
  }
}

export function resetSharedRedisForTesting() {
  redisInstance = undefined;
}
