/**
 * CitySense AI 助手 — Redis 对话历史管理。
 *
 * TASK-P2-004:按 sessionId 存储对话历史,24h TTL 自动过期。
 * 历史上限 20 条(约 10 轮),RPUSH 新消息到尾部,超出裁剪最旧的。
 *
 * 降级:Redis 不可用时所有操作返回空/无操作,对话退化为无历史单轮。
 */

import { getChatRedis } from "@/server/ai/chat-redis";
import type { ChatMessage } from "@/server/ai/chat-client";

const HISTORY_TTL_SECONDS = 24 * 60 * 60;
const HISTORY_MAX_LENGTH = 20;
const KEY_PREFIX = "citysense:chat:";

function sessionKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/**
 * 读取对话历史(按时间正序,最旧在前)。
 * Redis 不可用或无数据返回空数组。
 */
export async function loadChatHistory(sessionId: string | undefined): Promise<ChatMessage[]> {
  if (!sessionId) {
    return [];
  }

  const redis = getChatRedis();
  if (!redis) {
    return [];
  }

  try {
    // RPUSH 存储已保证时间正序(最旧在前),LRANGE 直接取,无需反转。
    const raw = await redis.lrange(sessionKey(sessionId), 0, -1);

    if (raw.length === 0) {
      return [];
    }

    const messages: ChatMessage[] = [];
    for (const item of raw) {
      try {
        messages.push(JSON.parse(item) as ChatMessage);
      } catch {
        // 单条解析失败跳过。
      }
    }

    return messages;
  } catch {
    return [];
  }
}

/**
 * 追加一条消息到历史尾部。
 * Redis 不可用时静默跳过。
 */
export async function appendChatMessage(sessionId: string | undefined, message: ChatMessage): Promise<void> {
  if (!sessionId) {
    return;
  }

  const redis = getChatRedis();
  if (!redis) {
    return;
  }

  const key = sessionKey(sessionId);

  try {
    const pipeline = redis.pipeline();
    pipeline.rpush(key, JSON.stringify(message));
    pipeline.ltrim(key, -HISTORY_MAX_LENGTH, -1);
    pipeline.expire(key, HISTORY_TTL_SECONDS);
    await pipeline.exec();
  } catch {
    // 写入失败不影响对话,降级为无历史。
  }
}

/**
 * 批量追加多条消息(如一轮对话的用户消息 + 助手回复)。
 */
export async function appendChatMessages(sessionId: string | undefined, messages: ChatMessage[]): Promise<void> {
  if (!sessionId || messages.length === 0) {
    return;
  }

  const redis = getChatRedis();
  if (!redis) {
    return;
  }

  const key = sessionKey(sessionId);

  try {
    const pipeline = redis.pipeline();
    for (const message of messages) {
      pipeline.rpush(key, JSON.stringify(message));
    }
    pipeline.ltrim(key, -HISTORY_MAX_LENGTH, -1);
    pipeline.expire(key, HISTORY_TTL_SECONDS);
    await pipeline.exec();
  } catch {
    // 降级。
  }
}

/**
 * 清空对话历史。
 */
export async function clearChatHistory(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  const redis = getChatRedis();
  if (!redis) {
    return false;
  }

  try {
    await redis.del(sessionKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

export const CHAT_HISTORY_TTL_SECONDS = HISTORY_TTL_SECONDS;
export const CHAT_HISTORY_MAX_LENGTH = HISTORY_MAX_LENGTH;
