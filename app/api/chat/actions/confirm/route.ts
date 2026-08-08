import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { claimPendingAction, finishPendingAction, getPendingAction, verifyPendingActionToken } from "@/server/ai/pending-actions";
import { executeChatTool } from "@/server/ai/chat-tools";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const viewer = await getOptionalUser();
  if (!viewer) return NextResponse.json({ error: "请先登录", code: "auth_required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { actionId?: string; actionToken?: string; imageIds?: string[] };
  if (!body.actionId || !body.actionToken) return NextResponse.json({ error: "缺少动作凭证" }, { status: 400 });
  // 用户在确认前于动作卡内选择的暂存图 id(可选,最多 5 张)。
  const imageIds = Array.isArray(body.imageIds)
    ? body.imageIds.filter((id) => typeof id === "string" && id.length > 0).slice(0, 5)
    : [];
  try {
    const current = getPendingAction(body.actionId, viewer.appUser.id);
    if (!verifyPendingActionToken(current, body.actionToken)) return NextResponse.json({ error: "动作凭证无效", code: "action_forbidden" }, { status: 403 });
    if (current.state === "succeeded") return NextResponse.json({ status: current.state, result: current.result });
    const action = claimPendingAction(body.actionId, viewer.appUser.id);
    if (action.state !== "executing") return NextResponse.json({ error: `动作当前状态为 ${action.state}`, code: "action_not_confirmable" }, { status: 409 });
    const result = await executeChatTool("__commit_action__", JSON.stringify({ tool: action.tool, args: action.args }), { appUserId: viewer.appUser.id, sessionId: action.sessionId, confirmedAction: true, attachImageIds: imageIds });
    const finished = finishPendingAction(action.id, viewer.appUser.id, result.content.startsWith("工具 ") ? "failed" : "succeeded", result);
    return NextResponse.json({ status: finished.state, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认失败", code: "action_failed" }, { status: 409 });
  }
}
