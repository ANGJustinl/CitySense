import { createHash, randomBytes } from "node:crypto";
import type { ChatContext } from "@/server/ai/chat-client";

export type PendingActionState = "awaiting_confirmation" | "executing" | "succeeded" | "failed" | "cancelled" | "expired";
export type PendingAction = {
  id: string;
  tokenHash: string;
  tool: string;
  args: Record<string, unknown>;
  actorUserId: string;
  sessionId?: string;
  preview: string;
  state: PendingActionState;
  expiresAt: number;
  result?: unknown;
};

const TTL_MS = 10 * 60_000;
const actions = new Map<string, PendingAction>();

function purge() {
  const now = Date.now();
  for (const [id, action] of actions) if (action.expiresAt <= now && action.state === "awaiting_confirmation") actions.set(id, { ...action, state: "expired" });
}

export function createPendingAction(input: { tool: string; args: Record<string, unknown>; context: ChatContext; preview: string }) {
  purge();
  if (!input.context.appUserId) throw new Error("此操作需要登录。请先登录后再试。");
  const id = `act_${randomBytes(16).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const action: PendingAction = { id, tokenHash, tool: input.tool, args: input.args, actorUserId: input.context.appUserId, sessionId: input.context.sessionId, preview: input.preview, state: "awaiting_confirmation", expiresAt: Date.now() + TTL_MS };
  actions.set(id, action);
  return { action, token };
}

export function getPendingAction(id: string, actorUserId: string) {
  purge();
  const action = actions.get(id);
  if (!action || action.actorUserId !== actorUserId) throw new Error("操作不存在或无权访问");
  return action;
}

export function cancelPendingAction(id: string, actorUserId: string) {
  const action = getPendingAction(id, actorUserId);
  if (action.state === "awaiting_confirmation") actions.set(id, { ...action, state: "cancelled" });
  return actions.get(id)!;
}

export function claimPendingAction(id: string, actorUserId: string) {
  const action = getPendingAction(id, actorUserId);
  if (action.state !== "awaiting_confirmation") return action;
  const claimed = { ...action, state: "executing" as const };
  actions.set(id, claimed);
  return claimed;
}

export function finishPendingAction(id: string, actorUserId: string, state: "succeeded" | "failed", result: unknown) {
  const action = getPendingAction(id, actorUserId);
  const finished = { ...action, state, result };
  actions.set(id, finished);
  return finished;
}

export function verifyPendingActionToken(action: PendingAction, token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return hash.length === action.tokenHash.length && hash === action.tokenHash;
}

export function pendingActionHash(action: PendingAction) {
  return createHash("sha256").update(JSON.stringify({ tool: action.tool, args: action.args })).digest("hex");
}
