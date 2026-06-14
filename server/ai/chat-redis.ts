/**
 * CitySense AI 助手 — 轻量 Redis 单例(首个 key-value 用途)。
 *
 * TASK-P2-004:项目现有 Redis 仅用于 BullMQ(每次新建连接)。
 * 对话历史需要频繁 KV 读写,用单例避免反复建连。
 *
 * 设计:
 * - 复用 process.env.REDIS_URL(与 ingest queue 同一实例)。
 * - 模块级单例,首次访问时建立,连接错误降级为 null(对话退化为无历史单轮)。
 * - 不影响现有 BullMQ 连接(独立 IORedis 实例)。
 */

import IORedis from "ioredis";

let chatRedisInstance: IORedis | null | undefined;

export function isChatRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * 获取对话 Redis 单例。
 * - 首次调用建立连接;失败或无 REDIS_URL 返回 null。
 * - 后续调用复用同一实例。
 * - undefined = 尚未初始化;null = 初始化失败/未配置。
 */
export function getChatRedis(): IORedis | null {
  if (chatRedisInstance !== undefined) {
    return chatRedisInstance;
  }

  if (!process.env.REDIS_URL) {
    chatRedisInstance = null;
    return null;
  }

  try {
    const client = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      enableOfflineQueue: false
    });

    client.on("error", () => {
      // 连接错误不抛出,标记为不可用,降级到无历史模式。
      chatRedisInstance = null;
    });

    chatRedisInstance = client;
    return client;
  } catch {
    chatRedisInstance = null;
    return null;
  }
}

/** 测试用:重置单例(模拟连接失败场景)。 */
export function resetChatRedisForTesting(): void {
  chatRedisInstance = undefined;
}
