import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { recomputeUserProfile } from "@/server/recommendation/user-profile-v2";

/**
 * TASK2-P0-001E：授权平台品味导入契约（草案）。
 *
 * 审批约束（2026-06-14 angjustinl）：
 * - 本轮只做契约、脱敏 mapper 和测试，不接 OAuth、不抓平台原始私密内容、不长期保存 raw 平台文本。
 * - 导入的 items 转成 UserInteraction（action ∈ {liked,saved,rated,watched,followed}），
 *   与站内反馈 action（up/down/save/dismiss）命名空间隔离，画像重算时天然不双算。
 * - 只保存派生标签、来源、权重、摘要；不保存原始平台私密内容全文。
 * - context 中脱敏：title 截断、tags 过滤、sourceId 仅保留哈希摘要。
 */

export const AUTHORIZED_TASTE_SOURCES = ["xiaohongshu", "douban", "bilibili"] as const;
export type AuthorizedTasteSource = (typeof AUTHORIZED_TASTE_SOURCES)[number];

export const AUTHORIZED_TASTE_ITEM_TYPES = [
  "note",
  "book",
  "movie",
  "music",
  "video",
  "topic"
] as const;
export type AuthorizedTasteItemType = (typeof AUTHORIZED_TASTE_ITEM_TYPES)[number];

export const AUTHORIZED_TASTE_ACTIONS = [
  "liked",
  "saved",
  "rated",
  "watched",
  "followed"
] as const;
export type AuthorizedTasteAction = (typeof AUTHORIZED_TASTE_ACTIONS)[number];

export type AuthorizedTasteItem = {
  sourceItemId?: string;
  title: string;
  itemType: AuthorizedTasteItemType;
  tags: string[];
  action: AuthorizedTasteAction;
  rating?: number;
  occurredAt?: string;
};

export type AuthorizedTasteImport = {
  userId: string;
  source: AuthorizedTasteSource;
  authorizedAt: string;
  expiresAt?: string;
  items: AuthorizedTasteItem[];
};

export const authorizedTasteImportSchema: z.ZodType<AuthorizedTasteImport> = z.object({
  userId: z.string().min(1).max(128),
  source: z.enum(AUTHORIZED_TASTE_SOURCES),
  authorizedAt: z.string().min(1),
  expiresAt: z.string().optional(),
  items: z
    .array(
      z.object({
        sourceItemId: z.string().max(256).optional(),
        title: z.string().min(1).max(200),
        itemType: z.enum(AUTHORIZED_TASTE_ITEM_TYPES),
        tags: z.array(z.string().min(1).max(40)).max(20).default([]),
        action: z.enum(AUTHORIZED_TASTE_ACTIONS),
        rating: z.number().min(0).max(10).optional(),
        occurredAt: z.string().optional()
      })
    )
    .max(500)
});

const TITLE_TRUNCATE = 60;
const TAG_MAX = 10;

function hashSourceItemId(source: string, sourceItemId: string | undefined) {
  if (!sourceItemId) {
    return undefined;
  }
  // 简单非加密哈希摘要，仅用于去重与引用，不可逆推原 ID。
  let hash = 0;
  const input = `${source}:${sourceItemId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return `hash:${(hash >>> 0).toString(16)}`;
}

/**
 * 脱敏 mapper：把 AuthorizedTasteItem 转成 UserInteraction 写入 payload。
 * - title 截断到 60 字符，不保存原始全文。
 * - tags 限制到 10 个、每个 40 字符。
 * - sourceItemId 仅保留哈希摘要。
 * - rating 范围 0-10。
 * 隐私边界：context 中不含原始平台私密内容正文。
 */
export function mapAuthorizedTasteItemToInteraction(
  item: AuthorizedTasteItem,
  context: { source: AuthorizedTasteSource; userId: string; authorizedAt: string }
) {
  const sanitizedTitle = item.title.slice(0, TITLE_TRUNCATE);
  const sanitizedTags = item.tags.slice(0, TAG_MAX).map((tag) => tag.slice(0, 40));
  const rating =
    typeof item.rating === "number" && Number.isFinite(item.rating)
      ? Math.max(0, Math.min(10, item.rating))
      : undefined;

  return {
    userId: context.userId,
    action: item.action,
    itemType: item.itemType,
    itemId: hashSourceItemId(context.source, item.sourceItemId),
    weight: 1, // recomputeUserProfile 内 IMPORT_ACTION_WEIGHT 会按 action 重定权重
    context: {
      tags: sanitizedTags,
      source: context.source,
      authorizedAt: context.authorizedAt,
      itemType: item.itemType,
      // 不保存原始 title 全文，仅保留截断摘要用于去重/追溯。
      titleDigest: sanitizedTitle,
      ...(rating !== undefined ? { rating } : {})
    }
  } as const;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type AuthorizedTasteImportResult = {
  ok: boolean;
  ingested: number;
  skipped: number;
  recomputedProfile: boolean;
};

/**
 * 导入授权品味 items：脱敏后写入 UserInteraction（命名空间隔离），再触发画像重算。
 * 不接 OAuth、不抓平台原始内容、不长期保存 raw 文本（约束）。
 * 写入失败或异常 → 返回 ok:false，不抛错。
 */
export async function ingestAuthorizedTasteImport(
  rawInput: unknown
): Promise<AuthorizedTasteImportResult> {
  const input = authorizedTasteImportSchema.parse(rawInput);

  try {
    const rows = input.items.map((item) =>
      mapAuthorizedTasteItemToInteraction(item, {
        source: input.source,
        userId: input.userId,
        authorizedAt: input.authorizedAt
      })
    );

    if (rows.length > 0) {
      await prisma.userInteraction.createMany({
        data: rows.map((row) => ({
          userId: row.userId,
          action: row.action,
          itemType: row.itemType,
          itemId: row.itemId,
          weight: row.weight,
          context: toJson(row.context)
        }))
      });
    }

    // 导入后触发画像重算（包含授权导入 action，与 feedback 命名空间隔离不双算）。
    try {
      await recomputeUserProfile(input.userId);
    } catch {
      // 画像重算失败不影响 interaction 写入结果。
      return { ok: true, ingested: rows.length, skipped: 0, recomputedProfile: false };
    }

    return {
      ok: true,
      ingested: rows.length,
      skipped: input.items.length - rows.length,
      recomputedProfile: true
    };
  } catch {
    return { ok: false, ingested: 0, skipped: input.items.length, recomputedProfile: false };
  }
}
