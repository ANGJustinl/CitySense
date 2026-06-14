import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  clearUserProfile,
  getUserProfileSummary
} from "@/server/recommendation/user-profile";

export const runtime = "nodejs";

const userIdQuery = z.object({
  userId: z
    .string()
    .trim()
    .min(1, "userId is required")
    .max(128, "userId too long")
});

/**
 * GET /api/user-profile?userId=...
 * 返回用户可见画像摘要（派生标签/权重/置信度/最近更新时间）。
 * 不返回 raw interactions（隐私）。无 userId 或无画像 → degraded:true + summary:null。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = userIdQuery.parse({
      userId: searchParams.get("userId") ?? ""
    });
    const summary = await getUserProfileSummary(parsed.userId);
    return NextResponse.json(summary);
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

/**
 * DELETE /api/user-profile?userId=...
 * 清空画像（UserPreference.metadata 置空，保留行）。清空后推荐回到无画像状态。
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
