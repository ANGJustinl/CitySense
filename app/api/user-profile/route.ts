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
import {
  ProfileAccessError,
  requireOwnedProfileKey
} from "@/server/auth/profile-access";
import { getOptionalUser } from "@/server/auth/current-user";

export const runtime = "nodejs";

const tagActionSchema = z.enum(["approve", "disapprove", "skip"]);

const profileKeyQuery = z.object({
  profileKey: z
    .string()
    .trim()
    .min(1, "userId is required")
    .max(128, "userId too long")
});

function profileKeyFromQuery(searchParams: URLSearchParams, viewerProfileKey?: string): string {
  return requireOwnedProfileKey({
    requestedProfileKey: searchParams.get("profileKey") ?? searchParams.get("userId") ?? "",
    sessionId: searchParams.get("sessionId") ?? undefined,
    viewerProfileKey
  })!;
}

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
    const viewer = await getOptionalUser();
    const view = searchParams.get("view");
    const profileKey = profileKeyFromQuery(searchParams, viewer?.appUser.id);

    // view=summary 保留兼容，但摘要与完整视图都来自统一画像引擎。
    if (view === "summary") {
      const parsed = profileKeyQuery.parse({ profileKey });
      const summary = await getUserProfileSummary(parsed.profileKey);
      return NextResponse.json(summary);
    }

    // 默认 → v1 融合画像（兼容既有标签表态 UI）。
    const city = searchParams.get("city") || "上海";
    const area = searchParams.get("area") || undefined;
    const profile = await getUserProfile({ userId: profileKey, city, area });
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status }
      );
    }

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
  sessionId: z.string().min(1).max(128).optional(),
  tag: z.string().min(1).max(60),
  action: tagActionSchema,
  city: z.string().max(60).optional(),
  area: z.string().max(60).optional()
});

/**
 * POST /api/user-profile
 * Body: { userId, tag, action: "approve"|"disapprove"|"skip" }
 * 记录显式标签态度并触发统一画像重算。skip 会保留审计但不再出现在待表态列表。
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
    const viewer = await getOptionalUser();
    const userId = requireOwnedProfileKey({
      requestedProfileKey: parsed.data.userId,
      sessionId: parsed.data.sessionId,
      viewerProfileKey: viewer?.appUser.id
    })!;

    await setTagPreference({
      userId,
      tag: parsed.data.tag,
      action: parsed.data.action as TagAction
    });

    // 重新读取完整画像，返回重算后的 dimensions 让前端刷新六维雷达图。
    // getUserProfile 内部并行聚合 explicit/implicit/city 三源，与首屏数据源一致。
    const refreshedProfile = await getUserProfile({
      userId,
      city: parsed.data.city || "上海",
      area: parsed.data.area || undefined
    });

    return NextResponse.json(refreshedProfile);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to save preference";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/user-profile?userId=...
 * 使用 reset epoch 清空画像：历史事实保留审计，但 resetAt 之前的行为永久不再参与推荐。
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const viewer = await getOptionalUser();
    const profileKey = profileKeyFromQuery(searchParams, viewer?.appUser.id);
    const parsed = profileKeyQuery.parse({ profileKey });
    const result = await clearUserProfile(parsed.profileKey);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid user profile request", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "User profile clear failed" }, { status: 500 });
  }
}
