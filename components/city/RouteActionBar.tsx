"use client";

import { useState } from "react";
import { Bookmark, Check, Share2, UserRoundPlus } from "lucide-react";
import type { RecommendedRoute } from "@/server/recommendation/types";
import { buildSaveFeedbackPayload, routeShareUrl } from "@/lib/route-actions";

export function RouteActionBar({ route, recommendationId, userId, sessionId, canBuddy, buddyDisabled = false, buddyLabel, onBuddyRequest, onFeedbackRecorded }: { route: RecommendedRoute; recommendationId?: string; userId?: string; sessionId?: string; canBuddy: boolean; buddyDisabled?: boolean; buddyLabel?: string; onBuddyRequest: () => void; onFeedbackRecorded?: () => void }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();

  async function save() {
    if (saved || saving || !recommendationId) return;
    setSaved(true); setSaving(true); setNotice(undefined);
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildSaveFeedbackPayload({ recommendationId, routeId: route.id, userId, sessionId })) });
      if (!response.ok) throw new Error();
      setNotice("已收藏这条路线"); onFeedbackRecorded?.();
    } catch { setSaved(false); setNotice("收藏失败，请稍后重试"); }
    finally { setSaving(false); }
  }

  async function share() {
    const url = routeShareUrl(route.id, window.location.origin);
    try {
      if (navigator.share) await navigator.share({ title: route.title, text: route.summary, url });
      else { await navigator.clipboard.writeText(url); setNotice("路线链接已复制"); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try { await navigator.clipboard.writeText(url); setNotice("路线链接已复制"); } catch { setNotice("暂时无法分享，请稍后重试"); }
    }
  }

  return <div className="commercial-route-action-wrap"><div className="commercial-route-actions"><button aria-label="收藏路线" aria-pressed={saved} className={saved ? "saved" : ""} disabled={saving || !recommendationId} onClick={() => void save()} type="button">{saved ? <Check size={18} /> : <Bookmark size={18} />}<span>{saved ? "已收藏" : "收藏"}</span></button><button aria-label="分享路线" onClick={() => void share()} type="button"><Share2 size={18} /><span>分享</span></button><button className="buddy-primary" disabled={buddyDisabled} onClick={onBuddyRequest} type="button"><UserRoundPlus size={19} /><span>{buddyLabel ?? (canBuddy ? "找搭子" : "登录后找搭子")}</span></button></div>{notice ? <p aria-live="polite">{notice}</p> : null}</div>;
}
