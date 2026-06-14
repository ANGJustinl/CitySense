import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  getUserProfile,
  setTagPreference,
  type TagAction
} from "@/server/recommendation/user-profile";
import {
  clearUserProfile,
  getUserProfileSummary
} from "@/server/recommendation/user-profile-v2";

export const runtime = "nodejs";

const tagActionSchema = z.enum(["approve", "disapprove", "skip"]);

const userIdQuery = z.object({
  userId: z
    .string()
    .trim()
    .min(1, "userId is required")
    .max(128, "userId too long")
});

/**
 * GET /api/user-profile?userId=user-001&city=上海&area=静安寺
 *   → 返回 v1 融合画像（显式 + 隐式 + 城市标签），驱动标签表态 UI。
 *
 * GET /api/user-profile?userId=user-001&view=summary
 *   → 返回 v2 画像摘要（派生标签/权重/置信度/最近更新时间），不返回 raw interactions（隐私）。
 *     无 userId 或无画像 → degraded:true + summary:null。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? "";
    const view = searchParams.get("view");

    // view=summary → v2 画像摘要（隐私边界：只返回派生标签/权重）。
    if (view === "summary") {
      const parsed = userIdQuery.parse({ userId });
      const summary = await getUserProfileSummary(parsed.userId);
      return NextResponse.json(summary);
    }

    // 默认 → v1 融合画像（兼容既有标签表态 UI）。
    const city = searchParams.get("city") || "上海";
    const area = searchParams.get("area") || undefined;
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required (e.g. /api/user-profile?userId=user-001)" },
        { status: 400 }
      );
    }
    const profile = await getUserProfile({ userId, city, area });
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid user profile request", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "User profile read failed" }, { status: 500 });
  }
}

const preferenceSchema = z.object({
  userId: z.string().min(1).max(128),
  tag: z.string().min(1).max(60),
  action: tagActionSchema,
  city: z.string().max(60).optional(),
  area: z.string().max(60).optional()
});

/**
 * POST /api/user-profile
 * Body: { userId, tag, action: "approve"|"disapprove"|"skip" }
 * 记录用户的显式标签偏好。`skip` 只记历史。驱动 v1 标签表态 UI。
 * 返回重算后的完整画像（含 dimensions），供前端即时刷新六维雷达图。
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = preferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    await setTagPreference({
      userId: parsed.data.userId,
      tag: parsed.data.tag,
      action: parsed.data.action as TagAction
    });

    // 重新读取完整画像，返回重算后的 dimensions 让前端刷新六维雷达图。
    // getUserProfile 内部并行聚合 explicit/implicit/city 三源，与首屏数据源一致。
    const refreshedProfile = await getUserProfile({
      userId: parsed.data.userId,
      city: parsed.data.city || "上海",
      area: parsed.data.area || undefined
    });

    return NextResponse.json(refreshedProfile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preference";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/user-profile?userId=...
 * 清空 v2 画像（UserPreference.metadata 置空，保留行）。清空后推荐回到无画像状态。
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = userIdQuery.parse({
      userId: searchParams.get("userId") ?? ""
    });
    const result = await clearUserProfile(parsed.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid user profile request", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "User profile clear failed" }, { status: 500 });
  }
}
