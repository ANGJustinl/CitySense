import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getUserProfile,
  setTagPreference,
  type TagAction
} from "@/server/recommendation/user-profile";

export const runtime = "nodejs";

const tagActionSchema = z.enum(["approve", "disapprove", "skip"]);

/**
 * GET /api/user-profile?userId=user-001&city=上海&area=静安寺
 * Returns the user's fused interest profile (explicit + implicit + city tags).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") || undefined;
  const city = url.searchParams.get("city") || "上海";
  const area = url.searchParams.get("area") || undefined;

  if (!userId) {
    return NextResponse.json(
      { error: "userId is required (e.g. /api/user-profile?userId=user-001)" },
      { status: 400 }
    );
  }

  const profile = await getUserProfile({ userId, city, area });
  return NextResponse.json(profile);
}

const preferenceSchema = z.object({
  userId: z.string().min(1).max(128),
  tag: z.string().min(1).max(60),
  action: tagActionSchema
});

/**
 * POST /api/user-profile
 * Body: { userId, tag, action: "approve"|"disapprove"|"skip" }
 * Records the user's explicit tag preference. `skip` only logs history.
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
    const result = await setTagPreference({
      userId: parsed.data.userId,
      tag: parsed.data.tag,
      action: parsed.data.action as TagAction
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preference";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
