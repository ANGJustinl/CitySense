import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { cancelPendingAction, getPendingAction, verifyPendingActionToken } from "@/server/ai/pending-actions";

export async function POST(request: Request) {
  const viewer = await getOptionalUser();
  if (!viewer) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { actionId?: string; actionToken?: string };
  if (!body.actionId || !body.actionToken) return NextResponse.json({ error: "缺少动作凭证" }, { status: 400 });
  try {
    const action = getPendingAction(body.actionId, viewer.appUser.id);
    if (!verifyPendingActionToken(action, body.actionToken)) return NextResponse.json({ error: "动作凭证无效" }, { status: 403 });
    return NextResponse.json({ status: cancelPendingAction(body.actionId, viewer.appUser.id).state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "取消失败" }, { status: 409 });
  }
}
