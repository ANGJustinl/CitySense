import type { DemoUserPersona } from "@/lib/demo-users";

/**
 * Demo 账号的画像 seed 定义。
 *
 * 每个 demo 账号通过一批 UserInteraction（action=up/save，走真实 feedback 通道）
 * 形成画像差异。recomputeUserProfile 聚合后写入 UserPreference.metadata.profile。
 *
 * 设计约束（与 user-profile-v2.ts recompute 对齐）：
 * - action ∈ {up, save}（FEEDBACK_ACTIONS），weight 走真实映射 up:1 / save:1.5
 * - (recommendationId, routeId, itemId) 三元组唯一，避免 dedupeFeedbackInteractions 合并
 * - context.tags / context.source 是画像维度聚合的关键字段
 * - 通过 sourceKey（"demo:" + seed id）引用 demo-seed-data 条目，seed 时查真实主键
 * - 每个账号 ≥6 条，确保 sampleSize≥6 → confidence=medium，calculateUserAffinityFromProfile 脱离中性
 */

export type DemoInteractionSeed = {
  /** demo-seed-data 里的条目 id（不含 "demo:" 前缀），用于查 sourceKey。 */
  seedId: string;
  /** 该条目的 entityType，决定查 Event 还是 Venue。 */
  entityType: "event" | "venue";
  action: "up" | "save";
  /** 命名空间：与画像 persona 关联，保证三元组唯一。 */
  recommendationNamespace: string;
  /** 画像维度聚合读 context.tags；可补充 persona 风格 tag 强化差异。 */
  contextTags: string[];
  contextSource: string;
};

export type DemoUserSeed = {
  userId: string;
  persona: DemoUserPersona;
  interactions: DemoInteractionSeed[];
};

/**
 * user1（文艺静思）：偏展览 / 书店 / 咖啡 / 安静 / solo。
 * 挑选 demo-seed-data 里偏静思向的条目，context.tags 强化文艺标签。
 */
const user1Interactions: DemoInteractionSeed[] = [
  {
    seedId: "seed-xuhui-film-night",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user1",
    contextTags: ["电影", "咖啡", "安静", "solo", "展览"],
    contextSource: "douban"
  },
  {
    seedId: "seed-xuhui-wukang-book-cafe",
    entityType: "venue",
    action: "save",
    recommendationNamespace: "demo-user1",
    contextTags: ["书店", "咖啡", "安静", "solo", "展览"],
    contextSource: "xiaohongshu"
  },
  {
    seedId: "seed-xuhui-long-museum-night",
    entityType: "event",
    action: "up",
    recommendationNamespace: "demo-user1",
    contextTags: ["展览", "艺术", "书店", "安静"],
    contextSource: "bilibili"
  },
  {
    seedId: "seed-jingan-rooftop-bookstore",
    entityType: "venue",
    action: "up",
    recommendationNamespace: "demo-user1",
    contextTags: ["书店", "安静", "solo", "展览"],
    contextSource: "amap-poi"
  },
  {
    seedId: "seed-jingan-gallery-night",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user1",
    contextTags: ["展览", "艺术", "安静", "solo", "书店"],
    contextSource: "trends-hub"
  },
  {
    seedId: "seed-changning-bookstore-cafe",
    entityType: "venue",
    action: "up",
    recommendationNamespace: "demo-user1",
    contextTags: ["书店", "咖啡", "安静", "展览"],
    contextSource: "xiaohongshu"
  },
  {
    seedId: "seed-huangpu-sinan-literature",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user1",
    contextTags: ["文学", "安静", "solo", "展览", "书店"],
    contextSource: "douban"
  },
  {
    seedId: "seed-changning-park-teahouse",
    entityType: "venue",
    action: "up",
    recommendationNamespace: "demo-user1",
    contextTags: ["安静", "solo", "书店", "展览"],
    contextSource: "amap-poi"
  }
];

/**
 * user2（热闹潮流）：偏 lively / 市集 / 独立音乐 / livehouse / 夜生活。
 * 挑选 demo-seed-data 里偏热闹向的条目，context.tags 强化潮流标签。
 */
const user2Interactions: DemoInteractionSeed[] = [
  {
    seedId: "seed-xuhui-westbund-market",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user2",
    contextTags: ["市集", "lively", "独立音乐", "夜生活"],
    contextSource: "xiaohongshu"
  },
  {
    seedId: "seed-jingan-coffee-festival",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user2",
    contextTags: ["市集", "lively", "独立音乐", "夜生活"],
    contextSource: "xiaohongshu"
  },
  {
    seedId: "seed-jingan-yuyuan-theatre",
    entityType: "event",
    action: "up",
    recommendationNamespace: "demo-user2",
    contextTags: ["夜生活", "lively", "独立音乐", "市集"],
    contextSource: "douban"
  },
  {
    seedId: "seed-changning-yuyintang",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user2",
    contextTags: ["独立音乐", "livehouse", "夜生活", "lively", "市集"],
    contextSource: "bilibili"
  },
  {
    seedId: "seed-changning-podcast-salon",
    entityType: "event",
    action: "up",
    recommendationNamespace: "demo-user2",
    contextTags: ["夜生活", "lively", "市集", "独立音乐"],
    contextSource: "douban"
  },
  {
    seedId: "seed-huangpu-xintiandi-popup",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user2",
    contextTags: ["lively", "市集", "独立音乐", "夜生活"],
    contextSource: "xiaohongshu"
  },
  {
    seedId: "seed-pudong-qiantan-music",
    entityType: "event",
    action: "save",
    recommendationNamespace: "demo-user2",
    contextTags: ["独立音乐", "lively", "市集", "夜生活", "livehouse"],
    contextSource: "bilibili"
  },
  {
    seedId: "seed-jingan-julu-bakery",
    entityType: "venue",
    action: "up",
    recommendationNamespace: "demo-user2",
    contextTags: ["夜生活", "lively", "市集", "独立音乐"],
    contextSource: "xiaohongshu"
  }
];

export const demoUserSeeds: DemoUserSeed[] = [
  {
    userId: "user1",
    persona: "quiet-culture",
    interactions: user1Interactions
  },
  {
    userId: "user2",
    persona: "lively-trend",
    interactions: user2Interactions
  }
];
