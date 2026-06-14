/**
 * Demo 用户账号定义（前后端共享）。
 *
 * 用于让推荐画像在 demo 场景下真实可感知：首页默认 user1，画像页/工作台
 * 都可切换。两个账号的画像差异（文艺静思 vs 热闹潮流）由 prisma/seed.ts
 * 写入 UserInteraction 后经 recomputeUserProfile 聚合产生，不走运行时 mock。
 *
 * 放在 lib/（非 server/）让前端组件和 seed 脚本都能 import。
 */

export const DEFAULT_DEMO_USER_ID = "user1";

export type DemoUserPersona = "quiet-culture" | "lively-trend";

export type DemoUser = {
  userId: string;
  /** 顶栏按钮显示文案。 */
  label: string;
  /** 一句话人设，用于 tooltip / onboarding。 */
  persona: DemoUserPersona;
  /** 画像摘要，用于切换按钮的副标题。 */
  blurb: string;
};

export const DEMO_USERS: DemoUser[] = [
  {
    userId: "user1",
    label: "小芸",
    persona: "quiet-culture",
    blurb: "文艺静思 · 展览 / 书店 / 咖啡 / 安静独处"
  },
  {
    userId: "user2",
    label: "阿浪",
    persona: "lively-trend",
    blurb: "热闹潮流 · 市集 / livehouse / 夜生活 / 独立音乐"
  }
];

export const DEMO_USER_IDS = DEMO_USERS.map((user) => user.userId);

/**
 * 每个 demo 账号的召回默认 interests（与 persona 对齐）。
 * 画像有数据时会被 getUserProfileSummary 的 topPositiveTags 覆盖；
 * 无画像（seed 未跑）时回退到这里，保证召回仍按 persona 分化。
 */
export const DEMO_USER_PERSONA_INTERESTS: Record<string, string[]> = {
  user1: ["展览", "书店", "咖啡", "漫画", "安静"],
  user2: ["市集", "独立音乐", "livehouse", "夜生活", "lively"]
};

export function isDemoUser(userId: string | undefined): boolean {
  return Boolean(userId && DEMO_USER_IDS.includes(userId));
}

export function findDemoUser(userId: string | undefined): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.userId === userId);
}
