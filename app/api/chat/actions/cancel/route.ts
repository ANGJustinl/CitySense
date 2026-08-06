import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { cancelPendingAction } from "@/server/ai/pending-actions";

export async function POST(request: Request) {
  const viewer = await getOptionalUser();
  if (!viewer) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { actionId?: string };
  if (!body.actionId) return NextResponse.json({ error: "缺少 actionId" }, { status: 400 });
  try {
    return NextResponse.json({ status: cancelPendingAction(body.actionId, viewer.appUser.id).state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "取消失败" }, { status: 409 });
  }
}
